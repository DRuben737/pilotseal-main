import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["commercial-knowledge-test"].metadata;

export default function CommercialKnowledgeTestPage() {
  return (
    <EndorsementGuidePage
      guide={endorsementGuides["commercial-knowledge-test"]}
    />
  );
}
