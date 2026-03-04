import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["practical-test"].metadata;

export default function PracticalTestPage() {
  return <EndorsementGuidePage guide={endorsementGuides["practical-test"]} />;
}
