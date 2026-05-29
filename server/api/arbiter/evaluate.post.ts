import { forwardArbiterRequest } from '../../utils/arbiterProxy'
import type { ArbiterResponse, AsyncEvalStartResponse, EvaluateRequest } from '~/types/api'

export default defineEventHandler(async (event) => {
  const body = await readBody<EvaluateRequest>(event)
  return forwardArbiterRequest<ArbiterResponse<AsyncEvalStartResponse>>(event, '/evaluate', {
    method: 'POST',
    body,
  })
})
