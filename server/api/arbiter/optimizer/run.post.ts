import { forwardArbiterRequest } from '../../../utils/arbiterProxy'
import type { ArbiterResponse, OptimizerRunStartRequest, OptimizerRunStartResponse } from '~/types/api'

export default defineEventHandler(async (event) => {
  const body = await readBody<OptimizerRunStartRequest>(event)
  if (
    !Number.isFinite(body.max_rounds) ||
    body.max_rounds < 1 ||
    body.max_rounds > 20 ||
    !Number.isFinite(body.target_accuracy) ||
    body.target_accuracy < 0.01 ||
    body.target_accuracy > 1
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: 'optimizer-run-settings-invalid',
      data: { detail: 'optimizer-run-settings-invalid' },
    })
  }

  return forwardArbiterRequest<ArbiterResponse<OptimizerRunStartResponse>>(event, '/optimizer/run', {
    method: 'POST',
    body,
  })
})
