import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["instrument-proficiency"].metadata;

export default function InstrumentProficiencyPage() {
  return (
    <EndorsementGuidePage
      guide={endorsementGuides["instrument-proficiency"]}
    />
  );
}
