import fs from "node:fs";
import path from "node:path";

import Image, { type StaticImageData } from "next/image";

type AdaptiveImageSlotProps = {
  src: string | StaticImageData;
  alt: string;
  label?: string;
  className?: string;
  frameClassName?: string;
  priority?: boolean;
};

function getPlaceholderName(src: string | StaticImageData, label?: string) {
  if (label) return label;
  if (typeof src === "string") {
    return src.split("/").filter(Boolean).pop() ?? src;
  }
  return "image";
}

function hasPublicImage(src: string) {
  const normalized = src.startsWith("/") ? src.slice(1) : src;
  return fs.existsSync(path.join(process.cwd(), "public", normalized));
}

export default function AdaptiveImageSlot({
  src,
  alt,
  label,
  className = "h-auto w-full",
  frameClassName = "",
  priority = false,
}: AdaptiveImageSlotProps) {
  const placeholderName = getPlaceholderName(src, label);
  const frameClasses = frameClassName ? `image-fit-frame ${frameClassName}` : "image-fit-frame";

  if (typeof src === "string") {
    if (!hasPublicImage(src)) {
      return (
        <div className={`${frameClasses} image-slot-placeholder`} aria-label={placeholderName}>
          <span className="image-slot-name">{placeholderName}</span>
        </div>
      );
    }

    return (
      <div className={frameClasses}>
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={900}
          className={className}
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className={frameClasses}>
      <Image src={src} alt={alt} className={className} priority={priority} />
    </div>
  );
}
