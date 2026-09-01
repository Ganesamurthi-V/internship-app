/**
 * Academic display constants.
 *
 * The institution only runs a single undergraduate programme, so `programme` is
 * never a real choice for a student. The backend still stores it as free text
 * (`Student.programme`), and older rows hold a department name because the
 * registration form used to reuse the department dropdown for it. Rendering this
 * constant instead of the stored value keeps every "Programme" label in the app
 * consistent, including for those legacy rows.
 */

/** The only programme offered — shown wherever a programme is displayed. */
export const PROGRAMME_LABEL = 'B.Tech';
