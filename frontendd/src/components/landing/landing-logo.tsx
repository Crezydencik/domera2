import Image from "next/image";
import Link from "next/link";
import { ROUTES } from "@/shared/lib/routes";

export const logoUrl =
  "https://firebasestorage.googleapis.com/v0/b/domera-eb224.firebasestorage.app/o/System%2FDomera_loga.png?alt=media&token=53ccefaa-c38f-490b-9138-010da531327e";

type LandingLogoProps = {
  className?: string;
  imageClassName?: string;
};

export function LandingLogo({ className = "", imageClassName = "" }: LandingLogoProps) {
  return (
    <Link href={ROUTES.landing} className={`inline-flex items-center ${className}`} aria-label="Domera">
      <Image
        src={logoUrl}
        alt="Domera"
        width={170}
        height={42}
        priority
        className={`h-9 w-auto object-contain ${imageClassName}`}
      />
    </Link>
  );
}
