import EndorsementGuidePage from "../EndorsementGuidePage";
import { endorsementGuides } from "../guide-content";

export const metadata = endorsementGuides["additional-category-class"].metadata;

export default function AdditionalCategoryClassPage() {
  return (
    <EndorsementGuidePage
      guide={endorsementGuides["additional-category-class"]}
    />
  );
}
