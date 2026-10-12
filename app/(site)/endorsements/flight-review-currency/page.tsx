import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["flight-review-currency"].metadata;

export default function FlightReviewCurrencyPage() {
  return (
    <EndorsementGuidePage guide={endorsementGuides["flight-review-currency"]} />
  );
}
