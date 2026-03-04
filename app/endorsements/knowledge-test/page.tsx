import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["knowledge-test"].metadata;

export default function KnowledgeTestPage() {
  return <EndorsementGuidePage guide={endorsementGuides["knowledge-test"]} />;
}
