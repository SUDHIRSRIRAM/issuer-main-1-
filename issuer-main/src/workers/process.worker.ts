import { removeBackground } from '@imgly/background-removal';
import imageCompression from 'browser-image-compression';

// Cache for processed images
const processedImagesCache = new Map();

// Optimize worker configuration
const workerConfig = {
  maxRetries: 2,
  compressionOptions: {
    maxSizeMB: 0.8, // Reduced max size
    maxWidthOrHeight: window.innerWidth <= 768 ? 384 : 512,
    useWebWorker: true,
    maxIteration: 2, // Limit compression iterations
    initialQuality: 0.8 // Start with lower quality
  },
  processingChunkSize: 1024 * 1024, // 1MB chunks
  cacheTimeout: 30 * 60 * 1000 // 30 minutes
};

// Initialize shared buffer for faster data transfer
let sharedBuffer;
try {
  sharedBuffer = new SharedArrayBuffer(workerConfig.processingChunkSize);
} catch (e) {
  console.warn('SharedArrayBuffer not available, falling back to regular processing');
}

// Optimize image before processing
async function optimizeImage(imageBlob) {
  // Check if image needs optimization
  if (imageBlob.size <= workerConfig.processingChunkSize) {
    return imageBlob;
  }

  try {
    // Apply aggressive compression for large images
    const compressionOptions = {
      ...workerConfig.compressionOptions,
      maxSizeMB: Math.min(1, imageBlob.size / (1024 * 1024) / 2) // Adaptive compression
    };

    const compressedBlob = await imageCompression(imageBlob, compressionOptions);
    console.log(`Image compressed from ${imageBlob.size} to ${compressedBlob.size} bytes`);
    return compressedBlob;
  } catch (error) {
    console.warn('Image compression failed:', error);
    return imageBlob;
  }
}

// Process image in chunks
async function processImageInChunks(imageBlob) {
  const chunks = Math.ceil(imageBlob.size / workerConfig.processingChunkSize);
  const processedChunks = [];

  for (let i = 0; i < chunks; i++) {
    const start = i * workerConfig.processingChunkSize;
    const end = Math.min(start + workerConfig.processingChunkSize, imageBlob.size);
    const chunk = imageBlob.slice(start, end);
    
    // Process chunk
    const processedChunk = await removeBackground(chunk, {
      progress: (p) => {
        const overallProgress = (i / chunks) + (p / chunks);
        self.postMessage({ type: 'progress', progress: overallProgress });
      }
    });
    
    processedChunks.push(processedChunk);
  }

  // Combine processed chunks
  return new Blob(processedChunks, { type: 'image/png' });
}

self.onmessage = async (e) => {
  const { imageData, options } = e.data;
  let retryCount = 0;

  try {
    // Check cache first
    const cacheKey = await crypto.subtle.digest('SHA-256', await (await fetch(imageData)).arrayBuffer())
      .then(hash => Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''));
    
    const cached = processedImagesCache.get(cacheKey);
    if (cached) {
      console.log('Using cached result');
      self.postMessage({ type: 'complete', result: cached });
      return;
    }

    // Fetch and optimize image
    const response = await fetch(imageData);
    let imageBlob = await response.blob();
    imageBlob = await optimizeImage(imageBlob);

    const processImage = async () => {
      try {
        // Process image with optimizations
        const result = sharedBuffer 
          ? await processImageInChunks(imageBlob)
          : await removeBackground(imageBlob, {
              ...options,
              progress: (p) => self.postMessage({ type: 'progress', progress: p })
            });

        // Create optimized blob and cache result
        const processedBlob = new Blob([result], { 
          type: 'image/png'
        });
        
        const url = URL.createObjectURL(processedBlob);
        processedImagesCache.set(cacheKey, url);

        // Clean old cache entries
        setTimeout(() => {
          processedImagesCache.delete(cacheKey);
          URL.revokeObjectURL(url);
        }, workerConfig.cacheTimeout);

        self.postMessage({ type: 'complete', result: url });
      } catch (error) {
        if (retryCount < workerConfig.maxRetries) {
          retryCount++;
          console.warn(`Retry attempt ${retryCount}/${workerConfig.maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          return processImage();
        }
        throw error;
      }
    };

    await processImage();
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error.message,
      details: {
        retryCount,
        timestamp: new Date().toISOString()
      }
    });
  }
};
