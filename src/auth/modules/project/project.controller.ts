import { ParseGatewayDataMiddleware } from "@shared/middlewares";
import { Response, VineValidator } from "@shared/utils";
import { Hono } from "hono";
import { container } from "tsyringe";
import ProjectService from "./project.service";
import {
  chartStatsQueryValidator,
  createProjectValidator,
  projectListQueryValidator,
  projectParamsValidator,
  updateProjectValidator,
} from "./project.validator";

const projectService = container.resolve(ProjectService);
const projectRouter = new Hono();

projectRouter.get(
  "",
  ParseGatewayDataMiddleware(),
  VineValidator("query", projectListQueryValidator),

  async (c) => {
    const userId = c.get("userId")!;
    const { isActive, name } = c.req.valid("query");

    const projects = await projectService.list(userId, {
      isActive,
      name
    });

    return Response.success(c, { data: projects });
  });

projectRouter.get(
  "/user-stats",
  ParseGatewayDataMiddleware(),
  async (c) => {
    const userId = c.get("userId")!;

    const stats = await projectService.userProjectStats(userId);
    return Response.success(c, { data: stats });
  }
);

projectRouter.post(
  "",
  ParseGatewayDataMiddleware(),
  VineValidator("json", createProjectValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const body = c.req.valid("json");

    const project = await projectService.create(userId, body);
    return Response.success(c, { data: project });
  }
);

projectRouter.put(
  ":id",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  VineValidator("json", updateProjectValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const updated = await projectService.update(userId, id, body);
    if (!updated) {
      return Response.error(c, { message: "Project not found", code: 404 });
    }

    return Response.success(c, { data: updated });
  }
);

projectRouter.delete(
  ":id",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.valid("param");

    const deleted = await projectService.delete(userId, id);
    if (!deleted) {
      return Response.error(c, { message: "Project not found", code: 404 });
    }

    return Response.success(c, { data: deleted });
  }
);

projectRouter.get(
  ":id",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.valid("param");

    const project = await projectService.getById(userId, id);
    if (!project) {
      return Response.error(c, { message: "Project not found", code: 404 });
    }

    return Response.success(c, { data: project });
  }
);



projectRouter.post(
  ":id/pause",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.valid("param");

    const valid = await projectService.isValidProject(userId, id);
    if (!valid) {
      return Response.error(c, { code: 400, message: "Project not found or does not belong to user" });
    }

    const paused = await projectService.pause(id);
    if (!paused) return Response.error(c, { code: 500, message: "Failed to pause project" });

    return Response.success(c, { data: paused });
  }
);

projectRouter.post(
  ":id/resume",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.valid("param");

    const valid = await projectService.isValidProject(userId, id);
    if (!valid) {
      return Response.error(c, { code: 400, message: "Project not found or does not belong to user" });
    }

    const resumed = await projectService.resume(id);
    if (!resumed) return Response.error(c, { code: 500, message: "Failed to resume project" });

    return Response.success(c, { data: resumed });
  }
);

projectRouter.get(
  ":id/stats",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id } = c.req.valid("param");

    const valid = await projectService.isValidProject(userId, id);
    if (!valid) {
      return Response.error(c, { code: 400, message: "Project not found or does not belong to user" });
    }

    const stats = await projectService.getProjectStats(id);
    return Response.success(c, { data: stats });
  }
);


projectRouter.get(
  ":id/chart-stats",
  ParseGatewayDataMiddleware(),
  VineValidator("param", projectParamsValidator),
  VineValidator("query", chartStatsQueryValidator),
  async (c) => {
    const userId = c.get("userId")!;
    const { id: projectId } = c.req.valid("param");
    const { type, months } = c.req.valid("query");

    const valid = await projectService.isValidProject(userId, projectId);
    if (!valid) {
      return Response.error(c, { code: 403, message: "Project not found or does not belong to user" });
    }
    try {
      const stats = await projectService.getChartStats(projectId, type as 'total' | 'apiKey', months);
      return Response.success(c, { data: stats });
    } catch (error) {
      return Response.error(c, { code: 400, message: error.message });
    }
  }
);


export default projectRouter;
