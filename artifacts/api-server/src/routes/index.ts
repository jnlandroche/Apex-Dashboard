import { Router, type IRouter } from "express";
import healthRouter from "./health";
import playersRouter from "./players";
import snapshotsRouter from "./snapshots";
import dashboardRouter from "./dashboard";
import pollRouter from "./poll";

const router: IRouter = Router();

router.use(healthRouter);
router.use(playersRouter);
router.use(snapshotsRouter);
router.use(dashboardRouter);
router.use(pollRouter);

export default router;
