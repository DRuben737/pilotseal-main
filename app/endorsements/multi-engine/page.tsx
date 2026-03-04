import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["multi-engine"].metadata;

export default function MultiEnginePage() {
  return <EndorsementGuidePage guide={endorsementGuides["multi-engine"]} />;
}
