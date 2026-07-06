import { Router } from "express";
import testRouter from "./test.js";
import authRouter from "./auth.js";
import helpRouter from "./help.js";
import askRouter from "./ask.js";

const router = Router();

router.use(testRouter);
router.use(authRouter);
router.use(helpRouter);
router.use(askRouter);

export default router;
