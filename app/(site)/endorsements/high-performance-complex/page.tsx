import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["high-performance-complex"].metadata;

export default function HighPerformanceComplexPage() {
  return (
    <EndorsementGuidePage
      guide={endorsementGuides["high-performance-complex"]}
    />
  );
}
