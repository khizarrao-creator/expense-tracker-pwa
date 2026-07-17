import React, { useRef, useState } from 'react';
import { UploadCloud, FileImage, X, AlertCircle } from 'lucide-react';

export interface FileUploadProps {
  accept?: string;
  maxSizeMb?: number;
  onFileSelect: (file: File | null) => void;
  label?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  accept = 'image/png, image/jpeg, image/jpg',
  maxSizeMb = 5,
  onFileSelect,
  label = 'Upload Screenshot'
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (selectedFile: File): boolean => {
    setError(null);

    // Validate type
    const acceptedTypes = accept.split(',').map(t => t.trim());
    if (!acceptedTypes.includes(selectedFile.type)) {
      setError(`Invalid file type. Supported: ${accept.replace(/image\//g, '').toUpperCase()}`);
      return false;
    }

    // Validate size
    const maxSize = maxSizeMb * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setError(`File is too large. Maximum size is ${maxSizeMb}MB.`);
      return false;
    }

    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (validateFile(selected)) {
        setFile(selected);
        setPreviewUrl(URL.createObjectURL(selected));
        onFileSelect(selected);
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (validateFile(selected)) {
        setFile(selected);
        setPreviewUrl(URL.createObjectURL(selected));
        onFileSelect(selected);
      }
    }
  };

  const handleRemove = () => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5 w-full text-left">
      {label && (
        <span className="block text-xs font-semibold text-foreground/80">
          {label}
        </span>
      )}

      {previewUrl ? (
        <div className="relative border border-border rounded-2xl overflow-hidden aspect-video bg-muted/20 flex items-center justify-center group">
          <img
            src={previewUrl}
            alt="Upload Preview"
            className="w-full h-full object-contain"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleRemove}
              className="p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-all active:scale-95 shadow-lg"
              title="Remove image"
            >
              <X size={18} />
            </button>
          </div>
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-[10px] text-white px-2 py-1 rounded-lg flex items-center gap-1.5 font-medium max-w-[80%] truncate">
            <FileImage size={12} />
            {file?.name}
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer
            transition-all duration-200 flex flex-col items-center justify-center gap-3 bg-card
            ${dragActive ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="p-3 bg-muted rounded-2xl text-muted-foreground">
            <UploadCloud size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Click to upload or drag & drop
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, JPEG (Max {maxSizeMb}MB)
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs font-semibold text-destructive flex items-center gap-1.5 animate-in fade-in duration-200">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
};
