import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFetch } from './useFetch'
import { fetchStudentByProfileId } from '../services/students'

/** Charge la fiche élève uniquement sur les pages élève (au montage). */
export function useStudentRecord() {
  const { user, isTeacher } = useAuth()

  const fetcher = useCallback(() => {
    if (!user?.id || isTeacher) return Promise.resolve(null)
    return fetchStudentByProfileId(user.id)
  }, [user?.id, isTeacher])

  return useFetch(fetcher, [user?.id, isTeacher], {
    enabled: Boolean(user?.id && !isTeacher),
  })
}
