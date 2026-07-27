const confirmed = process.env.PRODUCTION_DEPLOY_CONFIRMED === "yes";
const rollbackPlan = process.env.PRODUCTION_ROLLBACK_PLAN?.trim();

if (!confirmed || !rollbackPlan) {
  throw new Error(
    [
      "Production deployment is blocked.",
      "The user must explicitly request and confirm the production deployment.",
      "Set PRODUCTION_DEPLOY_CONFIRMED=yes and provide PRODUCTION_ROLLBACK_PLAN only for that confirmed deployment.",
    ].join(" "),
  );
}

console.log("Production deployment confirmation and rollback plan are present.");
