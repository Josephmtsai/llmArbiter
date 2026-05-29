import {
  forwardArbiterRequest,
  validateOptimizerRunId,
} from '../../../../utils/arbiterProxy'
import type { ArbiterResponse, OptimizerCancelResponse } from '~/types/api'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  const validation = validateOptimizerRunId(id)

  if (!validation.valid) {
    throw createError({
      statusCode: 400,
      statusMessage: validation.detail,
      data: { detail: validation.detail },
    })
  }

  return forwardArbiterRequest<ArbiterResponse<OptimizerCancelResponse>>(
    event,
    `/optimizer/runs/${id}`,
    { method: 'DELETE' },
  )
})
