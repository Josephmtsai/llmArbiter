import {
  forwardArbiterRequest,
  validateReviewQueueMutation,
} from '../../../utils/arbiterProxy'
import type { ArbiterResponse, ReviewQueueMutationRequest } from '~/types/api'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<ReviewQueueMutationRequest>(event)
  const validation = validateReviewQueueMutation(body)

  if (!validation.valid) {
    throw createError({
      statusCode: 400,
      statusMessage: validation.detail,
      data: { detail: validation.detail },
    })
  }

  return forwardArbiterRequest<ArbiterResponse<Record<string, never>>>(
    event,
    `/review-queue/${encodeURIComponent(id ?? '')}`,
    { method: 'PATCH', body },
  )
})
