import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { Passenger } from "../types";

// ===== تحويل بيانات Supabase لـ Passenger =====
function mapPassenger(p: Record<string, unknown>): Passenger {
  return {
    id: p.id as number,
    name_ar: (p.name_ar as string) || "",
    name_en: (p.name_en as string) || "",
    short_ar: (p.short_ar as string) || "",
    short_en: (p.short_en as string) || "",
    passport: (p.passport as string) || "",
    national_id: (p.national_id as string) || "",
    nat: (p.nat as string) || "",
    dob: (p.dob as string) || "",
    expiry: (p.expiry as string) || "",
    gender: (p.gender as string) || "",
    phone: (p.phone as string) || "",
    services: {
      bus: (p.bus as string) || "عادي",
      flight: (p.flight as string) || "عادي",
      hotel_type: (p.hotel_type as string) || "ثنائية",
      hotel_view: (p.hotel_view as string) || "مطلة",
      camp_mina: (p.camp_mina as string) || "عادي",
      camp_arafa: (p.camp_arafa as string) || "عادي",
    },
    rel: "",
    linked: -1,
    photo_url: (p.photo_url as string) || "",
    id_expiry: (p.id_expiry as string) || "",
    national_id_url: (p.national_id_url as string) || "",
    contract_url: (p.contract_url as string) || "",
    passport_url: (p.passport_url as string) || "",
    bus_id: (p.bus_id as number) || null,
    camp_mina_id: (p.camp_mina_id as number) || null,
    camp_arafa_id: (p.camp_arafa_id as number) || null,
    room_id: (p.room_id as number) || null,
    family_id: (p.family_id as string) || null,
    flight_id: (p.flight_id as number) || null,
    flight_class: (p.flight_class as string) || null,
  } as Passenger;
}

// ===== Hook الرئيسي =====
export function usePassengers() {
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ===== جلب البيانات =====
  useEffect(() => {
    const loadPassengers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("passengers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Load passengers error:", error);
        setError("فشل في تحميل بيانات الحجاج");
      } else if (data) {
        setPassengers(data.map(mapPassenger));
      }
      setLoading(false);
    };

    loadPassengers();

    // ===== Realtime — تحديث تلقائي =====
    const channel = supabase
      .channel("passengers-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "passengers" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setPassengers(prev => {
              if (prev.some(p => p.id === (payload.new as any).id)) return prev;
              return [mapPassenger(payload.new as Record<string, unknown>), ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            setPassengers(prev =>
              prev.map(p => p.id === (payload.new as any).id
                ? mapPassenger(payload.new as Record<string, unknown>)
                : p
              )
            );
          } else if (payload.eventType === "DELETE") {
            setPassengers(prev =>
              prev.filter(p => p.id !== (payload.old as any).id)
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ===== إضافة حاج =====
  const addPassenger = (passenger: Passenger) => {
    setPassengers(prev => {
      if (prev.some(p => p.id === passenger.id)) return prev;
      return [passenger, ...prev];
    });
  };

  // ===== تحديث حاج =====
  const updatePassenger = (id: number, updates: Partial<Passenger>) => {
    setPassengers(prev =>
      prev.map(p => p.id === id ? { ...p, ...updates } : p)
    );
  };

  // ===== حذف حاج =====
  const removePassenger = (id: number) => {
    setPassengers(prev => prev.filter(p => p.id !== id));
  };

  return {
    passengers,
    setPassengers,
    loading,
    error,
    addPassenger,
    updatePassenger,
    removePassenger,
  };
}
