/**
 * Minimal typing until real types are generated with `supabase gen types typescript`.
 * The generic table/function catch-alls let feature code drive its own row types
 * without fighting the PostgREST client's strict inference on `.insert()` / `.update()`.
 */
type AnyRow = Record<string, unknown>;

export type Database = {
  public: {
    Tables: {
      [table: string]: {
        Row: AnyRow;
        Insert: AnyRow;
        Update: AnyRow;
        Relationships: [];
      };
    };
    Functions: {
      [fn: string]: {
        Args: AnyRow;
        Returns: unknown;
      };
    };
    Enums: {
      role_intent: 'passenger' | 'driver' | 'both' | 'super_admin';
      energy_type: 'petrol' | 'diesel' | 'hybrid' | 'electric';
      doc_type: 'national_id' | 'driving_license' | 'vehicle_registration' | 'car_photo';
      doc_status: 'pending' | 'approved' | 'rejected';
      recurrence: 'once' | 'daily' | 'weekdays' | 'weekends' | 'weekly';
      journey_status: 'active' | 'full' | 'cancelled' | 'completed';
      booking_status:
        | 'requested' | 'accepted' | 'rejected'
        | 'boarding'  | 'in_trip'  | 'completed'
        | 'cancelled' | 'no_show';
      payment_status: 'unpaid' | 'manual_paid';
      admin_role: 'super_admin' | 'reviewer';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type RoleIntent = Database['public']['Enums']['role_intent'];
