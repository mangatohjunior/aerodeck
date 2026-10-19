const CONTROL_PLANE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isControlPlaneUuid(value: string): boolean {
  return CONTROL_PLANE_UUID.test(value);
}
