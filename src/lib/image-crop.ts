/** Crops an image to the exact pixel rectangle the user selected in the cropper
 *  (react-easy-crop's onCropComplete pixel crop, in the original image's own pixel
 *  coordinates) and re-encodes it at a bounded size — same maxDimension/quality
 *  convention as compressImageFile, so a cropped cover image is never larger than
 *  an uncropped one would have been. */
export function getCroppedImage(imageSrc: string, cropPixels: { x: number; y: number; width: number; height: number }, maxDimension = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(cropPixels.width, cropPixels.height));
      const outputWidth = Math.round(cropPixels.width * scale);
      const outputHeight = Math.round(cropPixels.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Couldn't process that image."));
        return;
      }
      ctx.drawImage(img, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, outputWidth, outputHeight);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Couldn't load that image."));
    img.src = imageSrc;
  });
}
