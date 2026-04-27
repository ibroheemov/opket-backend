import { Router } from 'express';
import { createFare, deleteFare, getFareByType, getFares, updateFare } from '../controllers/fare.controller';


const router = Router();

router.post('/', createFare);
router.get('/', getFares);
router.get('/:type', getFareByType);
router.put('/:id', updateFare);
router.delete('/:id', deleteFare);

export default router;
