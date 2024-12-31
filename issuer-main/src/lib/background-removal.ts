import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for maximum performance
env.allowLocalModels = true;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
env.backends.onnx.wasm.simd = true;

// Performance optimized dimensions
const MAX_IMAGE_DIMENSION = Math.min(window.innerWidth <= 768 ? 384 : 512, 512);
const COMPRESSION_QUALITY = window.innerWidth <= 768 ? 0.7 : 0.8;

// Cache and memory management
let segmenterInstance: any = null;
let lastProcessedTime = Date.now();
const modelCache = new Map();
const CACHE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Optimize image resizing
function resizeImageIfNeeded(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
  let width = image.naturalWidth;
  let height = image.naturalHeight;

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }

    // Use createImageBitmap for hardware acceleration
    createImageBitmap(image, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high'
    }).then(bitmap => {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    });
    return true;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0);
  return false;
}

// Memory cleanup
function cleanupResources() {
  if (Date.now() - lastProcessedTime > CACHE_TIMEOUT) {
    segmenterInstance = null;
    modelCache.clear();
    if (global.gc) global.gc();
  }
}

// Process image in chunks for better memory usage
async function processImageChunks(imageData: ImageData, mask: Uint8Array) {
  const chunkSize = 10000;
  const length = mask.length;
  const data = imageData.data;

  return new Promise<void>((resolve) => {
    let i = 0;
    function processChunk() {
      const end = Math.min(i + chunkSize, length);
      for (let j = i; j < end; j++) {
        data[j * 4 + 3] = Math.round((1 - mask[j]) * 255);
      }
      i += chunkSize;
      
      if (i < length) {
        // Use requestIdleCallback for better performance
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => processChunk());
        } else {
          setTimeout(processChunk, 0);
        }
      } else {
        resolve();
      }
    }
    processChunk();
  });
}

export const removeBackground = async (imageElement: HTMLImageElement): Promise<Blob> => {
  try {
    console.log('Starting background removal process...');
    lastProcessedTime = Date.now();
    
    // Initialize or reuse segmenter with optimizations
    if (!segmenterInstance) {
      segmenterInstance = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
        revision: 'main',
        cache: true,
        quantized: true,
        progress_callback: (progress: number) => {
          console.log(`Model loading progress: ${progress * 100}%`);
        }
      });
    }

    // Create optimized canvas context
    const canvas = new OffscreenCanvas(imageElement.width, imageElement.height);
    const ctx = canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true,
      desynchronized: true
    });
    
    if (!ctx) throw new Error('Could not get canvas context');
    
    // Optimize image size
    const wasResized = resizeImageIfNeeded(canvas as unknown as HTMLCanvasElement, ctx, imageElement);
    console.log(`Image ${wasResized ? 'was' : 'was not'} resized. Final dimensions: ${canvas.width}x${canvas.height}`);
    
    // Process with optimized quality
    const imageData = (canvas as unknown as HTMLCanvasElement).toDataURL('image/jpeg', COMPRESSION_QUALITY);
    console.log('Image converted to optimized format');
    
    const result = await segmenterInstance(imageData);
    
    if (!result || !Array.isArray(result) || result.length === 0 || !result[0].mask) {
      throw new Error('Invalid segmentation result');
    }
    
    // Use OffscreenCanvas for better performance
    const outputCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const outputCtx = outputCanvas.getContext('2d', {
      alpha: true,
      willReadFrequently: true,
      desynchronized: true
    });
    
    if (!outputCtx) throw new Error('Could not get output canvas context');
    
    // Use createImageBitmap for better performance
    const imageBitmap = await createImageBitmap(canvas);
    outputCtx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close();
    
    const outputImageData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    
    // Process mask data in chunks
    await processImageChunks(outputImageData, new Uint8Array(result[0].mask.data));
    
    outputCtx.putImageData(outputImageData, 0, 0);
    
    // Schedule cleanup
    setTimeout(cleanupResources, 0);
    
    // Convert to blob with optimized settings
    const blob = await outputCanvas.convertToBlob({
      type: 'image/png',
      quality: COMPRESSION_QUALITY
    });

    return blob;
  } catch (error) {
    console.error('Error removing background:', error);
    throw error;
  }
};

export const loadImage = (file: Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};