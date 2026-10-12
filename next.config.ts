/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/dashboard", destination: "/console", permanent: true },
      { source: "/dashboard/schedule", destination: "/console/personal/schedule", permanent: true },
      { source: "/dashboard/people", destination: "/console/personal/people", permanent: true },
      { source: "/dashboard/saved-people", destination: "/console/personal/people", permanent: true },
      { source: "/dashboard/aircraft", destination: "/console/personal/aircraft", permanent: true },
      { source: "/dashboard/my-aircraft", destination: "/console/personal/aircraft", permanent: true },
      { source: "/dashboard/reports", destination: "/console/personal/reports", permanent: true },
      { source: "/dashboard/flight-briefs", destination: "/console/personal/flight-briefs", permanent: true },
      { source: "/dashboard/records", destination: "/console/personal/flight-briefs", permanent: true },
      { source: "/dashboard/endorsements", destination: "/console/personal/endorsements", permanent: true },
      { source: "/dashboard/notifications", destination: "/console/personal/notifications", permanent: true },
      { source: "/dashboard/account-settings", destination: "/console/personal/account", permanent: true },
      { source: "/dashboard/organization", destination: "/console", permanent: true },
      { source: "/dashboard/organization/overview", destination: "/console/organization/people", permanent: true },
      { source: "/dashboard/organization/fleet", destination: "/console/organization/aircraft", permanent: true },
      { source: "/dashboard/organization/briefs", destination: "/console/personal/flight-briefs", permanent: true },
      { source: "/dashboard/organization/activity", destination: "/console/organization/aircraft?view=aircraft", permanent: true },
      { source: "/dashboard/organization/audit", destination: "/console/organization/aircraft?view=aircraft", permanent: true },
      { source: "/dashboard/organization/messages", destination: "/console/personal/notifications?view=organization", permanent: true },
      { source: "/console/organization/activity", destination: "/console/organization/aircraft?view=aircraft", permanent: true },
      { source: "/dashboard/admin", destination: "/console/platform/organizations", permanent: true },
      { source: "/dashboard/admin/overview", destination: "/console/platform/organizations", permanent: true },
      { source: "/dashboard/admin/access", destination: "/console/platform/organizations", permanent: true },
      { source: "/dashboard/admin/aircraft-assignments", destination: "/console/platform/aircraft?view=assignments", permanent: true },
      { source: "/dashboard/admin/audit", destination: "/console/platform/activity", permanent: true },
      { source: "/dashboard/admin/notifications", destination: "/console/platform/notices", permanent: true },
      { source: "/dashboard/admin/:path*", destination: "/console/platform/:path*", permanent: true },
      { source: "/dashboard/organization/:path*", destination: "/console/organization/:path*", permanent: true },
      { source: "/dashboard/:path*", destination: "/console/personal/:path*", permanent: true },
    ];
  },
};

module.exports = nextConfig;
