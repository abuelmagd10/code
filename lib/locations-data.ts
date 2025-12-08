// بيانات الدول والمحافظات والمدن
// Countries, Governorates, and Cities Data

export interface Country {
  code: string
  name_ar: string
  name_en: string
}

export interface Governorate {
  id: string
  country_code: string
  name_ar: string
  name_en: string
}

export interface City {
  id: string
  governorate_id: string
  name_ar: string
  name_en: string
}

// الدول المدعومة
export const countries: Country[] = [
  { code: "EG", name_ar: "مصر", name_en: "Egypt" },
  { code: "SA", name_ar: "السعودية", name_en: "Saudi Arabia" },
  { code: "AE", name_ar: "الإمارات", name_en: "UAE" },
  { code: "KW", name_ar: "الكويت", name_en: "Kuwait" },
  { code: "QA", name_ar: "قطر", name_en: "Qatar" },
  { code: "BH", name_ar: "البحرين", name_en: "Bahrain" },
  { code: "OM", name_ar: "عُمان", name_en: "Oman" },
  { code: "JO", name_ar: "الأردن", name_en: "Jordan" },
  { code: "LB", name_ar: "لبنان", name_en: "Lebanon" },
  { code: "IQ", name_ar: "العراق", name_en: "Iraq" },
  { code: "SY", name_ar: "سوريا", name_en: "Syria" },
  { code: "PS", name_ar: "فلسطين", name_en: "Palestine" },
  { code: "YE", name_ar: "اليمن", name_en: "Yemen" },
  { code: "LY", name_ar: "ليبيا", name_en: "Libya" },
  { code: "TN", name_ar: "تونس", name_en: "Tunisia" },
  { code: "DZ", name_ar: "الجزائر", name_en: "Algeria" },
  { code: "MA", name_ar: "المغرب", name_en: "Morocco" },
  { code: "SD", name_ar: "السودان", name_en: "Sudan" },
]

// المحافظات المصرية
export const governorates: Governorate[] = [
  { id: "eg_cairo", country_code: "EG", name_ar: "القاهرة", name_en: "Cairo" },
  { id: "eg_giza", country_code: "EG", name_ar: "الجيزة", name_en: "Giza" },
  { id: "eg_alex", country_code: "EG", name_ar: "الإسكندرية", name_en: "Alexandria" },
  { id: "eg_qaliubiya", country_code: "EG", name_ar: "القليوبية", name_en: "Qalyubia" },
  { id: "eg_sharqia", country_code: "EG", name_ar: "الشرقية", name_en: "Sharqia" },
  { id: "eg_dakahlia", country_code: "EG", name_ar: "الدقهلية", name_en: "Dakahlia" },
  { id: "eg_gharbia", country_code: "EG", name_ar: "الغربية", name_en: "Gharbia" },
  { id: "eg_monufia", country_code: "EG", name_ar: "المنوفية", name_en: "Monufia" },
  { id: "eg_beheira", country_code: "EG", name_ar: "البحيرة", name_en: "Beheira" },
  { id: "eg_kafr_elsheikh", country_code: "EG", name_ar: "كفر الشيخ", name_en: "Kafr El Sheikh" },
  { id: "eg_damietta", country_code: "EG", name_ar: "دمياط", name_en: "Damietta" },
  { id: "eg_port_said", country_code: "EG", name_ar: "بورسعيد", name_en: "Port Said" },
  { id: "eg_ismailia", country_code: "EG", name_ar: "الإسماعيلية", name_en: "Ismailia" },
  { id: "eg_suez", country_code: "EG", name_ar: "السويس", name_en: "Suez" },
  { id: "eg_north_sinai", country_code: "EG", name_ar: "شمال سيناء", name_en: "North Sinai" },
  { id: "eg_south_sinai", country_code: "EG", name_ar: "جنوب سيناء", name_en: "South Sinai" },
  { id: "eg_fayoum", country_code: "EG", name_ar: "الفيوم", name_en: "Fayoum" },
  { id: "eg_beni_suef", country_code: "EG", name_ar: "بني سويف", name_en: "Beni Suef" },
  { id: "eg_minya", country_code: "EG", name_ar: "المنيا", name_en: "Minya" },
  { id: "eg_asyut", country_code: "EG", name_ar: "أسيوط", name_en: "Asyut" },
  { id: "eg_sohag", country_code: "EG", name_ar: "سوهاج", name_en: "Sohag" },
  { id: "eg_qena", country_code: "EG", name_ar: "قنا", name_en: "Qena" },
  { id: "eg_luxor", country_code: "EG", name_ar: "الأقصر", name_en: "Luxor" },
  { id: "eg_aswan", country_code: "EG", name_ar: "أسوان", name_en: "Aswan" },
  { id: "eg_red_sea", country_code: "EG", name_ar: "البحر الأحمر", name_en: "Red Sea" },
  { id: "eg_new_valley", country_code: "EG", name_ar: "الوادي الجديد", name_en: "New Valley" },
  { id: "eg_matrouh", country_code: "EG", name_ar: "مطروح", name_en: "Matrouh" },
]

// المدن المصرية (أهم المدن لكل محافظة)
export const cities: City[] = [
  // القاهرة
  { id: "cairo_nasr_city", governorate_id: "eg_cairo", name_ar: "مدينة نصر", name_en: "Nasr City" },
  { id: "cairo_heliopolis", governorate_id: "eg_cairo", name_ar: "مصر الجديدة", name_en: "Heliopolis" },
  { id: "cairo_maadi", governorate_id: "eg_cairo", name_ar: "المعادي", name_en: "Maadi" },
  { id: "cairo_shubra", governorate_id: "eg_cairo", name_ar: "شبرا", name_en: "Shubra" },
  { id: "cairo_downtown", governorate_id: "eg_cairo", name_ar: "وسط البلد", name_en: "Downtown" },
  { id: "cairo_new_cairo", governorate_id: "eg_cairo", name_ar: "القاهرة الجديدة", name_en: "New Cairo" },
  { id: "cairo_zamalek", governorate_id: "eg_cairo", name_ar: "الزمالك", name_en: "Zamalek" },
  { id: "cairo_mokattam", governorate_id: "eg_cairo", name_ar: "المقطم", name_en: "Mokattam" },
  { id: "cairo_ain_shams", governorate_id: "eg_cairo", name_ar: "عين شمس", name_en: "Ain Shams" },
  { id: "cairo_matareya", governorate_id: "eg_cairo", name_ar: "المطرية", name_en: "Matareya" },
  // الجيزة
  { id: "giza_dokki", governorate_id: "eg_giza", name_ar: "الدقي", name_en: "Dokki" },
  { id: "giza_mohandessin", governorate_id: "eg_giza", name_ar: "المهندسين", name_en: "Mohandessin" },
  { id: "giza_agouza", governorate_id: "eg_giza", name_ar: "العجوزة", name_en: "Agouza" },
  { id: "giza_haram", governorate_id: "eg_giza", name_ar: "الهرم", name_en: "Haram" },
  { id: "giza_faisal", governorate_id: "eg_giza", name_ar: "فيصل", name_en: "Faisal" },
  { id: "giza_6october", governorate_id: "eg_giza", name_ar: "السادس من أكتوبر", name_en: "6th of October" },
  { id: "giza_sheikh_zayed", governorate_id: "eg_giza", name_ar: "الشيخ زايد", name_en: "Sheikh Zayed" },
  { id: "giza_imbaba", governorate_id: "eg_giza", name_ar: "إمبابة", name_en: "Imbaba" },
  { id: "giza_boulaq", governorate_id: "eg_giza", name_ar: "بولاق الدكرور", name_en: "Boulaq Dakrour" },
  // الإسكندرية
  { id: "alex_montaza", governorate_id: "eg_alex", name_ar: "المنتزه", name_en: "Montaza" },
  { id: "alex_sidi_gaber", governorate_id: "eg_alex", name_ar: "سيدي جابر", name_en: "Sidi Gaber" },
  { id: "alex_smouha", governorate_id: "eg_alex", name_ar: "سموحة", name_en: "Smouha" },
  { id: "alex_san_stefano", governorate_id: "eg_alex", name_ar: "سان ستيفانو", name_en: "San Stefano" },
  { id: "alex_miami", governorate_id: "eg_alex", name_ar: "ميامي", name_en: "Miami" },
  { id: "alex_mamoura", governorate_id: "eg_alex", name_ar: "المعمورة", name_en: "Mamoura" },
  { id: "alex_borg_el_arab", governorate_id: "eg_alex", name_ar: "برج العرب", name_en: "Borg El Arab" },
  // القليوبية
  { id: "qaliubiya_banha", governorate_id: "eg_qaliubiya", name_ar: "بنها", name_en: "Banha" },
  { id: "qaliubiya_shubra_elkhema", governorate_id: "eg_qaliubiya", name_ar: "شبرا الخيمة", name_en: "Shubra El Khema" },
  { id: "qaliubiya_qalyub", governorate_id: "eg_qaliubiya", name_ar: "قليوب", name_en: "Qalyub" },
  { id: "qaliubiya_khanka", governorate_id: "eg_qaliubiya", name_ar: "الخانكة", name_en: "Khanka" },
  { id: "qaliubiya_obour", governorate_id: "eg_qaliubiya", name_ar: "العبور", name_en: "Obour" },
  // الشرقية
  { id: "sharqia_zagazig", governorate_id: "eg_sharqia", name_ar: "الزقازيق", name_en: "Zagazig" },
  { id: "sharqia_10th_ramadan", governorate_id: "eg_sharqia", name_ar: "العاشر من رمضان", name_en: "10th of Ramadan" },
  { id: "sharqia_bilbeis", governorate_id: "eg_sharqia", name_ar: "بلبيس", name_en: "Bilbeis" },
  { id: "sharqia_abu_hammad", governorate_id: "eg_sharqia", name_ar: "أبو حماد", name_en: "Abu Hammad" },
  // الدقهلية
  { id: "dakahlia_mansoura", governorate_id: "eg_dakahlia", name_ar: "المنصورة", name_en: "Mansoura" },
  { id: "dakahlia_talkha", governorate_id: "eg_dakahlia", name_ar: "طلخا", name_en: "Talkha" },
  { id: "dakahlia_mit_ghamr", governorate_id: "eg_dakahlia", name_ar: "ميت غمر", name_en: "Mit Ghamr" },
  // الغربية
  { id: "gharbia_tanta", governorate_id: "eg_gharbia", name_ar: "طنطا", name_en: "Tanta" },
  { id: "gharbia_mahalla", governorate_id: "eg_gharbia", name_ar: "المحلة الكبرى", name_en: "Mahalla" },
  { id: "gharbia_kafr_el_zayat", governorate_id: "eg_gharbia", name_ar: "كفر الزيات", name_en: "Kafr El Zayat" },
  // المنوفية
  { id: "monufia_shibin", governorate_id: "eg_monufia", name_ar: "شبين الكوم", name_en: "Shibin El Kom" },
  { id: "monufia_menouf", governorate_id: "eg_monufia", name_ar: "منوف", name_en: "Menouf" },
  { id: "monufia_sadat_city", governorate_id: "eg_monufia", name_ar: "مدينة السادات", name_en: "Sadat City" },
  // البحيرة
  { id: "beheira_damanhur", governorate_id: "eg_beheira", name_ar: "دمنهور", name_en: "Damanhur" },
  { id: "beheira_kafr_dawwar", governorate_id: "eg_beheira", name_ar: "كفر الدوار", name_en: "Kafr Dawwar" },
  { id: "beheira_rashid", governorate_id: "eg_beheira", name_ar: "رشيد", name_en: "Rashid" },
  // كفر الشيخ
  { id: "kafr_el_sheikh_city", governorate_id: "eg_kafr_elsheikh", name_ar: "كفر الشيخ", name_en: "Kafr El Sheikh" },
  { id: "kafr_el_sheikh_desouk", governorate_id: "eg_kafr_elsheikh", name_ar: "دسوق", name_en: "Desouk" },
  // دمياط
  { id: "damietta_city", governorate_id: "eg_damietta", name_ar: "دمياط", name_en: "Damietta" },
  { id: "damietta_new", governorate_id: "eg_damietta", name_ar: "دمياط الجديدة", name_en: "New Damietta" },
  // بورسعيد
  { id: "port_said_city", governorate_id: "eg_port_said", name_ar: "بورسعيد", name_en: "Port Said" },
  { id: "port_said_fuad", governorate_id: "eg_port_said", name_ar: "بورفؤاد", name_en: "Port Fuad" },
  // الإسماعيلية
  { id: "ismailia_city", governorate_id: "eg_ismailia", name_ar: "الإسماعيلية", name_en: "Ismailia" },
  { id: "ismailia_fayed", governorate_id: "eg_ismailia", name_ar: "فايد", name_en: "Fayed" },
  // السويس
  { id: "suez_city", governorate_id: "eg_suez", name_ar: "السويس", name_en: "Suez" },
  // شمال سيناء
  { id: "north_sinai_arish", governorate_id: "eg_north_sinai", name_ar: "العريش", name_en: "Arish" },
  // جنوب سيناء
  { id: "south_sinai_sharm", governorate_id: "eg_south_sinai", name_ar: "شرم الشيخ", name_en: "Sharm El Sheikh" },
  { id: "south_sinai_dahab", governorate_id: "eg_south_sinai", name_ar: "دهب", name_en: "Dahab" },
  // الفيوم
  { id: "fayoum_city", governorate_id: "eg_fayoum", name_ar: "الفيوم", name_en: "Fayoum" },
  // بني سويف
  { id: "beni_suef_city", governorate_id: "eg_beni_suef", name_ar: "بني سويف", name_en: "Beni Suef" },
  // المنيا
  { id: "minya_city", governorate_id: "eg_minya", name_ar: "المنيا", name_en: "Minya" },
  // أسيوط
  { id: "asyut_city", governorate_id: "eg_asyut", name_ar: "أسيوط", name_en: "Asyut" },
  // سوهاج
  { id: "sohag_city", governorate_id: "eg_sohag", name_ar: "سوهاج", name_en: "Sohag" },
  // قنا
  { id: "qena_city", governorate_id: "eg_qena", name_ar: "قنا", name_en: "Qena" },
  // الأقصر
  { id: "luxor_city", governorate_id: "eg_luxor", name_ar: "الأقصر", name_en: "Luxor" },
  // أسوان
  { id: "aswan_city", governorate_id: "eg_aswan", name_ar: "أسوان", name_en: "Aswan" },
  // البحر الأحمر
  { id: "red_sea_hurghada", governorate_id: "eg_red_sea", name_ar: "الغردقة", name_en: "Hurghada" },
  { id: "red_sea_safaga", governorate_id: "eg_red_sea", name_ar: "سفاجا", name_en: "Safaga" },
  // الوادي الجديد
  { id: "new_valley_kharga", governorate_id: "eg_new_valley", name_ar: "الخارجة", name_en: "Kharga" },
  // مطروح
  { id: "matrouh_city", governorate_id: "eg_matrouh", name_ar: "مرسى مطروح", name_en: "Marsa Matrouh" },
]

// دالة للحصول على المحافظات حسب الدولة
export function getGovernoratesByCountry(countryCode: string): Governorate[] {
  return governorates.filter(g => g.country_code === countryCode)
}

// دالة للحصول على المدن حسب المحافظة
export function getCitiesByGovernorate(governorateId: string): City[] {
  return cities.filter(c => c.governorate_id === governorateId)
}

