import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import pilotSealValley from "@/images/pilotseal-valley-background-v2.jpg";
import HomeNavigation from "./HomeNavigation";
import styles from "./home-template.module.css";

export const metadata: Metadata = {
  title: "PilotSeal | Flight training, made clearer",
  description:
    "Create FAA endorsements, prepare flight briefs, and keep students, aircraft, and training records together.",
  alternates: {
    canonical: "/home",
  },
};

export default function Home() {
  return (
    <main className={styles.root}>
      <Image
        src={pilotSealValley}
        alt=""
        className={styles.backgroundImage}
        fill
        priority
        quality={75}
        sizes="100vw"
      />
      <div className={styles.backgroundTone} aria-hidden="true" />

      <a className={styles.skipLink} href="#pilot-home-content">
        Skip to content
      </a>

      <HomeNavigation />

      <section id="pilot-home-content" className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>FAA tools for instructors and student pilots</p>
          <h1 className={styles.heading}>
            Less time on paperwork.
            <br />
            More time in the air.
          </h1>
          <p className={styles.subheading}>
            Create FAA endorsements, prepare flight briefs, and keep students, aircraft, and training records together.
          </p>
          <Link className={styles.primaryCta} href="/tools/endorsement-generator">
            Create an endorsement
          </Link>
        </div>
      </section>
    </main>
  );
}
