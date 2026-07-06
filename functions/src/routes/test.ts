import { Router } from "express";

const router = Router();

router.get("/test", (req, res) => {
  res.status(200).send("Up and Running");
});

export default router;
