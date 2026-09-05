export function normalizeCompanyName(name = '') {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function groupApplications(applications) {
  const groups = new Map();

  for (const application of applications) {
    const key = application.companyKey || normalizeCompanyName(application.company);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        company: application.company,
        applications: []
      });
    }
    groups.get(key).applications.push(application);
  }

  return [...groups.values()]
    .map(group => {
      const applicationsByLatestActivity = [...group.applications].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );

      return {
        ...group,
        applications: applicationsByLatestActivity,
        updatedAt: applicationsByLatestActivity[0].updatedAt
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
