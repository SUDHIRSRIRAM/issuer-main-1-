import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Trash2, Download, Upload } from "lucide-react";
import imageCompression from 'browser-image-compression';
import { removeBackground } from '@imgly/background-removal';

interface ProcessedImage {
  original: File | null;
  originalUrl: string;
  processed: Blob | null;
  processedUrl: string | null;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

const SETTINGS = {
  upload: {
    maxSize: 10 * 1024 * 1024,
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.8,
    types: ['image/jpeg', 'image/png', 'image/webp']
  },
  processing: {
    model: "isnet",
    format: "image/png",
    quality: 0.9
  }
};

export const ImageProcessor: React.FC = () => {
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (image) {
      if (image.originalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(image.originalUrl);
      }
      if (image.processedUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(image.processedUrl);
      }
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [image]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const processImage = useCallback(async (file: File): Promise<Blob> => {
    let timer: NodeJS.Timeout | null = null;
    try {
      setTimeLeft(20);
      setProgress(0);
      
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timer) clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      timerRef.current = timer;

      const result = await removeBackground(file, {
        model: SETTINGS.processing.model,
        progress: (p) => {
          const progressValue = Math.floor(p * 100);
          setProgress(progressValue);
        },
        output: {
          format: SETTINGS.processing.format,
          quality: SETTINGS.processing.quality,
        }
      });

      if (timer) clearInterval(timer);
      timerRef.current = null;
      
      return new Blob([result], { type: SETTINGS.processing.format });
    } catch (error) {
      if (timer) clearInterval(timer);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setTimeLeft(0);
      setProgress(0);
      console.error('Processing error:', error);
      throw error;
    }
  }, []);

  const handleImageUpload = useCallback(async (files: FileList | File[]) => {
    if (!files.length) return;

    const file = files[0];
    if (!SETTINGS.upload.types.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPG, PNG, or WebP image",
        variant: "destructive",
      });
      return;
    }

    if (file.size > SETTINGS.upload.maxSize) {
      toast({
        title: "File too large",
        description: "Please upload an image under 10MB",
        variant: "destructive",
      });
      return;
    }

    try {
      cleanup();

      const compressedFile = await imageCompression(file, {
        maxSizeMB: SETTINGS.upload.maxSize / (1024 * 1024),
        maxWidthOrHeight: Math.max(SETTINGS.upload.maxWidth, SETTINGS.upload.maxHeight),
        useWebWorker: true,
        fileType: file.type as any,
      });

      setImage({
        original: compressedFile,
        originalUrl: URL.createObjectURL(compressedFile),
        processed: null,
        processedUrl: null,
        name: file.name,
        status: 'pending'
      });

      toast({ 
        title: "Upload successful", 
        description: "Image ready for processing" 
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image",
        variant: "destructive",
      });
    }
  }, [cleanup, toast]);

  const handleProcess = useCallback(async () => {
    if (!image?.original || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);
    setTimeLeft(20);

    try {
      const processedBlob = await processImage(image.original);
      const processedUrl = URL.createObjectURL(processedBlob);

      setImage(prev => {
        if (prev?.processedUrl) {
          URL.revokeObjectURL(prev.processedUrl);
        }
        return prev ? {
          ...prev,
          processed: processedBlob,
          processedUrl: processedUrl,
          status: 'completed'
        } : null;
      });

      toast({
        title: "Success",
        description: "Image processed successfully"
      });
    } catch (error) {
      console.error('Processing error:', error);
      setImage(prev => prev ? { ...prev, status: 'failed' } : null);
      toast({
        title: "Processing failed",
        description: "Failed to process image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setTimeLeft(0);
      setProgress(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [image, isProcessing, processImage, toast]);

  const handleDelete = useCallback(() => {
    if (!image) return;
    cleanup();
    setImage(null);
    setTimeLeft(0);
    setProgress(0);
    toast({
      title: "Deleted",
      description: "Image has been removed"
    });
  }, [image, cleanup, toast]);

  const handleDownload = useCallback(() => {
    if (!image?.processed || !image.processedUrl) return;

    const a = document.createElement('a');
    a.href = image.processedUrl;
    a.download = `${image.name.replace(/\.[^/.]+$/, '')}_processed.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [image]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleImageUpload(e.dataTransfer.files);
  }, [handleImageUpload]);

  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardContent className="p-4 sm:p-6 md:p-8">
        <div className="space-y-6">
          {!image ? (
            <div 
              className={`border-2 border-dashed rounded-lg p-6 md:p-12 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-gray-200'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="mx-auto w-16 h-16 md:w-20 md:h-20 mb-4">
                <Upload className="w-full h-full text-gray-400" />
              </div>
              <h3 className="text-base md:text-lg font-medium mb-2">Upload an Image</h3>
              <p className="text-sm text-gray-500 mb-4">
                Drag and drop your image here, or click below
              </p>
              <Button 
                onClick={() => fileInputRef.current?.click()}
                className="mx-auto"
              >
                Choose Image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={SETTINGS.upload.types.join(',')}
                onChange={(e) => handleImageUpload(e.target.files || [])}
                className="hidden"
              />
              <p className="text-xs text-gray-400 mt-4">
                Supports: JPG, PNG, WebP
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                <div>
                  <h3 className="font-medium mb-3">Original</h3>
                  <div className="relative aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden shadow-sm">
                    <img 
                      src={image.originalUrl} 
                      alt="Original" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-3">Processed</h3>
                  <div className="relative aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden shadow-sm">
                    {image.processedUrl ? (
                      <img 
                        src={image.processedUrl} 
                        alt="Processed" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {isProcessing ? (
                          <div className="text-center">
                            <div className="relative inline-flex">
                              {/* Outer ring */}
                              <div className="absolute inset-0">
                                <div 
                                  className="w-32 h-32 rounded-full border-8 border-blue-500/20"
                                />
                              </div>
                              {/* Spinning ring */}
                              <div className="absolute inset-0">
                                <div 
                                  className="w-32 h-32 rounded-full border-t-8 border-blue-600 animate-spin"
                                  style={{ animationDuration: '1s' }}
                                />
                              </div>
                              {/* Progress circle */}
                              <div className="w-32 h-32 rounded-full flex items-center justify-center">
                                <div className="text-center">
                                  <div className="text-4xl font-bold text-blue-600">
                                    {timeLeft}
                                  </div>
                                  <div className="text-sm font-medium text-gray-600">
                                    {progress}%
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="mt-6 space-y-2">
                              <p className="text-base font-medium text-gray-700">
                                Processing your image...
                              </p>
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0s' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0.2s' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0.4s' }} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center p-4">
                            <p className="text-sm text-gray-500">
                              Click Process to remove background
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleDelete}
                  className="w-full sm:w-auto px-8 py-2 text-lg font-medium border-2 hover:bg-red-50 hover:border-red-500 hover:text-red-600 transition-all duration-200 hover:scale-105"
                >
                  <Trash2 className="w-5 h-5 mr-2" />
                  Delete Image
                </Button>

                {!isProcessing && (
                  <Button
                    size="lg"
                    onClick={image.processed ? handleDownload : handleProcess}
                    className={`w-full sm:w-auto px-8 py-2 text-lg font-medium transition-all duration-200 ${
                      image.processed 
                        ? 'bg-blue-600 hover:bg-blue-700 hover:scale-105' 
                        : 'bg-blue-500 hover:bg-blue-600 hover:scale-105'
                    }`}
                  >
                    {image.processed ? (
                      <>
                        <Download className="w-5 h-5 mr-2" />
                        Download Result
                      </>
                    ) : (
                      <>
                        <span className="mr-2">⚡</span>
                        Process Image
                      </>
                    )}
                  </Button>
                )}

                {isProcessing && (
                  <Button
                    size="lg"
                    disabled
                    className="w-full sm:w-auto px-8 py-2 text-lg font-medium bg-blue-500"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin" />
                      Processing...
                    </div>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};