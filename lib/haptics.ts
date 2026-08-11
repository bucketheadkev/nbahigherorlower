/**
 * Centralized Ballion haptics — re-exports the Capacitor-backed utility.
 * Prefer importing from here or `@/lib/tradeup/haptics`.
 */
export {
  hapticTap,
  hapticSelection,
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticSuccess,
  hapticWarning,
  hapticError,
  hapticSpinTick,
  hapticSpinStop,
  hapticWheelStart,
  hapticWheelTick,
  hapticWheelStop,
  hapticSlotConfirm,
  hapticTicketPrint,
  hapticPlayerReveal,
  hapticTicketInsert,
  hapticValueComplete,
  hapticCancel,
  hapticImpact,
  hapticNotification,
} from './tradeup/haptics';
