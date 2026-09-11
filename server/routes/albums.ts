import express from 'express';
import { AlbumDao, AlbumInputError } from '../../database/dao/albumDao';
import { requireAdmin } from '../auth';
const router = express.Router();
const dao = new AlbumDao();
const handle = (action: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler => async (req, res) => {
  try { await action(req, res); }
  catch (error) { if (!(error instanceof AlbumInputError)) console.error('画册操作失败', error); res.status(error instanceof AlbumInputError ? 400 : 500).json({ success: false, error: error instanceof AlbumInputError ? error.message : '画册操作失败，请重试' }); }
};
router.get('/', handle(async (_req, res) => res.json({ success: true, data: await dao.list() })));
router.get('/admin', requireAdmin, handle(async (_req, res) => res.json({ success: true, data: await dao.list(true) })));
router.get('/admin/:id', requireAdmin, handle(async (req, res) => {
  const data = await dao.detail(req.params.id, true);
  return res.status(data ? 200 : 404).json({ success: Boolean(data), data, error: data ? undefined : '画册不存在' });
}));
router.put('/order', requireAdmin, handle(async (req, res) => { await dao.reorder(req.body.ids); res.json({ success: true }); }));
router.post('/members', requireAdmin, handle(async (req, res) => { await dao.addPhotos(req.body.albumIds, req.body.photoIds); res.json({ success: true }); }));
router.post('/', requireAdmin, handle(async (req, res) => res.status(201).json({ success: true, data: await dao.save(null, req.body) })));
router.put('/:id', requireAdmin, handle(async (req, res) => res.json({ success: true, data: await dao.save(req.params.id, req.body) })));
router.delete('/:id', requireAdmin, handle(async (req, res) => { const deleted = await dao.delete(req.params.id); res.status(deleted ? 200 : 404).json({ success: Boolean(deleted), error: deleted ? undefined : '画册不存在' }); }));
router.get('/:id', handle(async (req, res) => {
  const data = await dao.detail(req.params.id);
  res.status(data ? 200 : 404).json({ success: Boolean(data), data, error: data ? undefined : '画册不存在或未发布' });
}));
export default router;
