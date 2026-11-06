// GET /api/auth/config — whether this deployment supports accounts (needs the STORE KV binding).
import { json } from '../../_lib/util.js';
export const onRequestGet = ({ env }) => json({ accounts: !!env.STORE });
