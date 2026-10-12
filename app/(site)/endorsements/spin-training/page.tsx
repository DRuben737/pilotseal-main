import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["spin-training"].metadata;

export default function SpinTrainingPage() {
  return <EndorsementGuidePage guide={endorsementGuides["spin-training"]} />;
}
