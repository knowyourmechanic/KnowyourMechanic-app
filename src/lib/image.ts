// Downscales a picked photo to a JPEG no larger than `maxSide` px so uploads
// stay small on mobile data (camera photos are often 3–8 MB).
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
    if (!file.type.startsWith('image/')) throw new Error('Please select an image file');
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Could not read that image'));
            el.src = url;
        });
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        return blob ?? file;
    } finally {
        URL.revokeObjectURL(url);
    }
}
