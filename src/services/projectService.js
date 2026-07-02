const prisma = require('../utils/prisma');

async function getProjectByKey(projectKey) {
  return prisma.project.findUnique({ where: { projectKey } });
}

async function createProject(data) {
  return prisma.project.create({
    data: {
      name: data.name,
      projectKey: data.projectKey,
      githubOwner: data.githubOwner,
      githubRepo: data.githubRepo,
      installationId: data.installationId,
    },
  });
}

async function getAllProjects() {
  return prisma.project.findMany({
    include: {
      _count: { select: { feedbacks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function updateProject(id, data) {
  return prisma.project.update({ where: { id }, data });
}

async function deleteProject(id) {
  await prisma.feedback.deleteMany({ where: { projectId: id } });
  return prisma.project.delete({ where: { id } });
}

module.exports = {
  getProjectByKey,
  createProject,
  getAllProjects,
  updateProject,
  deleteProject,
};