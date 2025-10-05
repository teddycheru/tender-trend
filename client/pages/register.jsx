import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";

const sectors = ["Construction", "IT", "Healthcare", "Education", "Agriculture", "Manufacturing"].sort();
const regions = ["Ethiopia", "Kenya", "Uganda", "Tanzania", "South Africa"].sort();

export default function Register() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    companyName: "",
    companyDescription: "",
    sectors: [],
    regionFocus: [],
    companySize: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);

  // Refs for detecting outside clicks
  const dropdownRefs = {
    sectors: useRef(null),
    regionFocus: useRef(null),
    companySize: useRef(null),
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedInside = Object.values(dropdownRefs).some(
        (ref) => ref.current && ref.current.contains(event.target)
      );
      if (!clickedInside) setOpenDropdown(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      const updatedArray = checked
        ? [...formData[name], value]
        : formData[name].filter((item) => item !== value);
      setFormData((prev) => ({ ...prev, [name]: updatedArray }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const toggleDropdown = (field) => {
    setOpenDropdown(openDropdown === field ? null : field);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = "First Name is required";
    if (!formData.lastName.trim()) newErrors.lastName = "Last Name is required";
    if (!formData.username.trim()) newErrors.username = "Username is required";
    else if (formData.username.length < 3 || formData.username.length > 20) 
      newErrors.username = "Username must be 3-20 characters";
    if (!formData.companyName.trim()) newErrors.companyName = "Company Name is required";
    if (!formData.companyDescription.trim()) newErrors.companyDescription = "Company Description is required";
    if (formData.sectors.length === 0) newErrors.sectors = "At least one sector is required";
    if (formData.regionFocus.length === 0) newErrors.regionFocus = "At least one region is required";
    if (!formData.companySize) newErrors.companySize = "Company Size is required";
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      newErrors.email = "Email is invalid";
    }
    if (!formData.password.trim()) newErrors.password = "Password is required";
    else if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters";
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      // Send registration request
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token") || ""}`
        },
        body: JSON.stringify({
          first_name: formData.firstName,
          last_name: formData.lastName,
          username: formData.username,
          company_name: formData.companyName,
          company_description: formData.companyDescription,
          sectors: formData.sectors,
          region_focus: formData.regionFocus,
          company_size: formData.companySize,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      // Reset errors
      let newErrors = {};

      if (!response.ok) {
        if (data.detail) {
          // If backend sends an array of errors
          if (Array.isArray(data.detail)) {
            data.detail.forEach((err) => {
              const msg = err.msg || err;
              if (msg.toLowerCase().includes("username")) newErrors.username = msg;
              else if (msg.toLowerCase().includes("email")) newErrors.email = msg;
              else newErrors.general = msg;
            });
          } 
          // If backend sends a string error
          else if (typeof data.detail === "string") {
            if (data.detail.toLowerCase().includes("username")) newErrors.username = data.detail;
            else if (data.detail.toLowerCase().includes("email")) newErrors.email = data.detail;
            else newErrors.general = data.detail;
          }
          // If backend sends an object
          else if (typeof data.detail === "object") {
            newErrors.general = JSON.stringify(data.detail);
          }
        }

        setErrors(newErrors);
        return;
      }

      // Registration successful → auto-login
      localStorage.setItem("token", data.access_token);
      const payload = JSON.parse(atob(data.access_token.split(".")[1]));
      localStorage.setItem("token_expiry", payload.exp * 1000);

      router.replace("/dashboard");

    } catch (error) {
      console.error("Registration error:", error);
      setErrors({ general: error.message });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl mt-10">
        {/*Top Login Link */}

        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">Create Your Account</h1>

        <div className="text-center mb-6">
          <p className="text-gray-600">
            Already have an account?{" "}
            <a
              href="/login"
              className="text-blue-600 font-semibold hover:underline hover:text-blue-800 transition"
            >
              Login here
            </a>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name Fields */}
          <div className="flex space-x-4">
            <div className="w-1/2">
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="First Name"
                className={`w-full p-3 border rounded-lg ${errors.firstName ? "border-red-500" : ""}`}
                required
              />
              {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
            </div>
            <div className="w-1/2">
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Last Name"
                className={`w-full p-3 border rounded-lg ${errors.lastName ? "border-red-500" : ""}`}
                required
              />
              {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
            </div>
          </div>

          {/* Username & Email */}
          <div className="flex space-x-4">
            <div className="w-1/2">
              {errors.username && <p className="text-red-500 text-sm mb-1">{errors.username}</p>}
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Username"
                className={`w-full p-3 border rounded-lg ${errors.username ? "border-red-500" : ""}`}
                required
              />
            </div>
            <div className="w-1/2">
              {errors.email && <p className="text-red-500 text-sm mb-1">{errors.email}</p>}
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email"
                className={`w-full p-3 border rounded-lg ${errors.email ? "border-red-500" : ""}`}
                required
              />
            </div>
          </div>

          {/* Company Info */}
          <div>
            <input
              type="text"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              placeholder="Company Name"
              className={`w-full p-3 border rounded-lg ${errors.companyName ? "border-red-500" : ""}`}
              required
            />
            {errors.companyName && <p className="text-red-500 text-sm mt-1">{errors.companyName}</p>}
          </div>
          <div>
            <textarea
              name="companyDescription"
              value={formData.companyDescription}
              onChange={handleChange}
              placeholder="About your company, focus areas..."
              className={`w-full p-3 border rounded-lg h-28 ${errors.companyDescription ? "border-red-500" : ""}`}
              required
            />
            {errors.companyDescription && <p className="text-red-500 text-sm mt-1">{errors.companyDescription}</p>}
          </div>

          {/* Dropdown - Sectors */}
          <div className="relative" ref={dropdownRefs.sectors}>
            <button
              type="button"
              onClick={() => toggleDropdown("sectors")}
              className={`w-full p-3 text-left border rounded-lg flex justify-between items-center bg-gray-50 hover:bg-gray-100 ${errors.sectors ? "border-red-500" : ""}`}
            >
              <span>
                {formData.sectors.length > 0
                  ? `Sectors: ${formData.sectors.join(", ")}`
                  : "Select Sectors (Interest Areas)"}
              </span>
              <span className="text-gray-500">{openDropdown === "sectors" ? "▲" : "▼"}</span>
            </button>
            {openDropdown === "sectors" && (
              <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-md max-h-48 overflow-y-auto">
                {sectors.map((sector) => (
                  <label key={sector} className="block px-4 py-2 hover:bg-gray-100 cursor-pointer">
                    <input
                      type="checkbox"
                      name="sectors"
                      value={sector}
                      checked={formData.sectors.includes(sector)}
                      onChange={handleChange}
                      className="mr-2"
                    />
                    {sector}
                  </label>
                ))}
              </div>
            )}
            {errors.sectors && <p className="text-red-500 text-sm mt-1">{errors.sectors}</p>}
          </div>

          {/* Dropdown - Region Focus */}
          <div className="relative" ref={dropdownRefs.regionFocus}>
            <button
              type="button"
              onClick={() => toggleDropdown("regionFocus")}
              className={`w-full p-3 text-left border rounded-lg flex justify-between items-center bg-gray-50 hover:bg-gray-100 ${errors.regionFocus ? "border-red-500" : ""}`}
            >
              <span>
                {formData.regionFocus.length > 0
                  ? `Regions: ${formData.regionFocus.join(", ")}`
                  : "Select Region Focus"}
              </span>
              <span className="text-gray-500">{openDropdown === "regionFocus" ? "▲" : "▼"}</span>
            </button>
            {openDropdown === "regionFocus" && (
              <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-md max-h-48 overflow-y-auto">
                {regions.map((region) => (
                  <label key={region} className="block px-4 py-2 hover:bg-gray-100 cursor-pointer">
                    <input
                      type="checkbox"
                      name="regionFocus"
                      value={region}
                      checked={formData.regionFocus.includes(region)}
                      onChange={handleChange}
                      className="mr-2"
                    />
                    {region}
                  </label>
                ))}
              </div>
            )}
            {errors.regionFocus && <p className="text-red-500 text-sm mt-1">{errors.regionFocus}</p>}
          </div>

          {/* Company Size (Radio Dropdown) */}
          <div className="relative" ref={dropdownRefs.companySize}>
            <button
              type="button"
              onClick={() => toggleDropdown("companySize")}
              className={`w-full p-3 text-left border rounded-lg flex justify-between items-center bg-gray-50 hover:bg-gray-100 ${errors.companySize ? "border-red-500" : ""}`}
            >
              <span>{formData.companySize || "Select Company Size"}</span>
              <span className="text-gray-500">{openDropdown === "companySize" ? "▲" : "▼"}</span>
            </button>
            {openDropdown === "companySize" && (
              <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-md">
                {["less than 5", "6-10", "10-20", "more than 20"].map((size) => (
                  <label key={size} className="block px-4 py-2 hover:bg-gray-100 cursor-pointer">
                    <input
                      type="radio"
                      name="companySize"
                      value={size}
                      checked={formData.companySize === size}
                      onChange={handleChange}
                      className="mr-2"
                    />
                    {size}
                  </label>
                ))}
              </div>
            )}
            {errors.companySize && <p className="text-red-500 text-sm mt-1">{errors.companySize}</p>}
          </div>

          {/* Password & Confirm Password */}
          <div className="flex space-x-4">
            <div className="w-1/2">
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Password (min 6 characters)"
                className={`w-full p-3 border rounded-lg ${errors.password ? "border-red-500" : ""}`}
                required
              />
              {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
            </div>
            <div className="w-1/2">
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm Password"
                className={`w-full p-3 border rounded-lg ${errors.confirmPassword ? "border-red-500" : ""}`}
                required
              />
              {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Register
          </button>

          {/* General Error (e.g., API failure) */}
          {errors.general && <p className="text-red-500 text-center mt-2">{errors.general}</p>}
        </form>
      </div>
    </div>
  );
}