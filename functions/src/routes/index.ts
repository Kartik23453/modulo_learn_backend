import { Router } from "express";
import testRouter from "./test.js";
import authRouter from "./auth.js";
import helpRouter from "./help.js";

const router = Router();

router.use(testRouter);
router.use(authRouter);
router.use(helpRouter);

export default router;
