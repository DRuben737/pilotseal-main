import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["instrument-knowledge-test"].metadata;

export default function InstrumentKnowledgeTestPage() {
  return (
    <EndorsementGuidePage
      guide={endorsementGuides["instrument-knowledge-test"]}
    />
  );
}
