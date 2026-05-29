import { forwardArbiterRequest } from '../../../utils/arbiterProxy'
import type { ArbiterResponse, ReviewQueueResponse } from '~/types/api'

export default defineEventHandler(event =>
  forwardArbiterRequest<ArbiterResponse<ReviewQueueResponse>>(event, '/review-queue'),
)
