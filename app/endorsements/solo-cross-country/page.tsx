import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["solo-cross-country"].metadata;

export default function SoloCrossCountryPage() {
  return (
    <EndorsementGuidePage guide={endorsementGuides["solo-cross-country"]} />
  );
}
