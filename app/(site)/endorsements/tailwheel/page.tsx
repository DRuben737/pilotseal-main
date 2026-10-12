import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides.tailwheel.metadata;

export default function TailwheelPage() {
  return <EndorsementGuidePage guide={endorsementGuides.tailwheel} />;
}
