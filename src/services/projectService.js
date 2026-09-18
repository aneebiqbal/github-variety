const prisma = require('../utils/prisma');

async function getProjectByKey(projectKey) {
  return prisma.project.findUnique({ where: { projectKey } });
}

async function getProjectById(id) {
  return prisma.project.findUnique({ where: { id } });
}

async function createProject(data) {
  return prisma.project.create({
    data: {
      name: data.name,
      projectKey: data.projectKey,
      githubOwner: data.githubOwner,
      githubRepo: data.githubRepo,
      organizationId: data.organizationId,
    },
  });
}

// Tenant-scoped: only returns projects belonging to the given org.
async function getProjectsByOrg(organizationId) {
  return prisma.project.findMany({
    where: { organizationId },
    include: {
      _count: { select: { feedbacks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// Tenant-scoped update. Uses updateMany with a compound where so a project
// outside this org matches zero rows instead of throwing. Returns the count
// of matched rows (0 = not found in this org).
async function updateProjectById(id, organizationId, data) {
  return prisma.project.updateMany({
    where: { id, organizationId },
    data,
  });
}

// Tenant-scoped delete. Child feedbacks cascade via the FK's onDelete: Cascade.
// Returns the count of matched rows (0 = not found in this org).
async function deleteProjectById(id, organizationId) {
  return prisma.project.deleteMany({
    where: { id, organizationId },
  });
}

module.exports = {
  getProjectByKey,
  getProjectById,
  createProject,
  getProjectsByOrg,
  updateProjectById,
  deleteProjectById,
};
