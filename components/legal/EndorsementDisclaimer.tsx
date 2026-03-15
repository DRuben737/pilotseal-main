type EndorsementDisclaimerProps = {
  className?: string;
};

export default function EndorsementDisclaimer({
  className = "",
}: EndorsementDisclaimerProps) {
  return (
    <div className={`endorsement-disclaimer ${className}`.trim()}>
      <p className="endorsement-disclaimer-kicker">FAA reference note</p>
      <p className="endorsement-disclaimer-copy">
        This tool generates endorsement language based on FAA Advisory Circular
        AC 61-65 and related FAA guidance. Flight instructors remain
        responsible for verifying endorsements comply with current FAA
        regulations and the specific circumstances of the student.
      </p>
    </div>
  );
}
