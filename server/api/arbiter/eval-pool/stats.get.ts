import { forwardArbiterRequest } from '../../../utils/arbiterProxy'
import type { ArbiterResponse, EvalPoolStats } from '~/types/api'

export default defineEventHandler(event =>
  forwardArbiterRequest<ArbiterResponse<EvalPoolStats>>(event, '/eval-pool/stats'),
)
