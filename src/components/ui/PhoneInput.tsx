/** Common dialling codes, UK first since most Live·En·Synergy audience members are UK-based. */
const COUNTRY_CODES = [
  { code: "+44", label: "🇬🇧 +44 UK" },
  { code: "+353", label: "🇮🇪 +353 Ireland" },
  { code: "+1", label: "🇺🇸 +1 US/Canada" },
  { code: "+33", label: "🇫🇷 +33 France" },
  { code: "+49", label: "🇩🇪 +49 Germany" },
  { code: "+34", label: "🇪🇸 +34 Spain" },
  { code: "+39", label: "🇮🇹 +39 Italy" },
  { code: "+31", label: "🇳🇱 +31 Netherlands" },
  { code: "+351", label: "🇵🇹 +351 Portugal" },
  { code: "+61", label: "🇦🇺 +61 Australia" },
  { code: "+91", label: "🇮🇳 +91 India" },
  { code: "+971", label: "🇦🇪 +971 UAE" },
  { code: "+27", label: "🇿🇦 +27 South Africa" },
  { code: "+64", label: "🇳🇿 +64 New Zealand" },
];

/** Phone number entry split into a country-code picker and the local number. */
export function PhoneInput({
  countryCodeName = "phone_country_code",
  phoneName = "phone",
  defaultCountryCode,
  defaultPhone,
  required = false,
  id = "phone",
}: {
  countryCodeName?: string;
  phoneName?: string;
  defaultCountryCode?: string | null;
  defaultPhone?: string | null;
  required?: boolean;
  id?: string;
}) {
  return (
    <div className="flex gap-2">
      <select
        name={countryCodeName}
        aria-label="Country code"
        className="select w-[8rem] shrink-0"
        defaultValue={defaultCountryCode ?? "+44"}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        id={id}
        name={phoneName}
        type="tel"
        required={required}
        className="input flex-1"
        placeholder="7911 123456"
        defaultValue={defaultPhone ?? ""}
      />
    </div>
  );
}
