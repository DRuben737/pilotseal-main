import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["student-solo"].metadata;

export default function StudentSoloPage() {
  return <EndorsementGuidePage guide={endorsementGuides["student-solo"]} />;
}
