import { forwardArbiterRequest } from '../../../utils/arbiterProxy'
import type { ArbiterResponse, OptimizerHistoryResponse } from '~/types/api'

export default defineEventHandler(event =>
  forwardArbiterRequest<ArbiterResponse<OptimizerHistoryResponse>>(event, '/optimizer/history'),
)
