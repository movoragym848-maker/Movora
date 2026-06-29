import { useState, useEffect } from "react";
import "./Onboarding.css";

export default function Onboarding({ onComplete }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  const slides = [
    {
      title: "Welcome to Movora 🏋️",
      subtitle: "Your Personal Gym Companion",
      description: "Transform your fitness journey with intelligent workout tracking and personalized guidance.",
      icon: "💪",
      color: "#3B82F6"
    },
    {
      title: "Track Your Workouts",
      subtitle: "Every Rep Counts",
      description: "Log exercises, sets, and weights with our intuitive interface. Monitor your progress in real-time.",
      icon: "📊",
      color: "#10B981"
    },
    {
      title: "Smart Nutrition",
      subtitle: "Fuel Your Body Right",
      description: "Track calories, manage macros, and get personalized meal recommendations tailored to your goals.",
      icon: "🍎",
      color: "#F59E0B"
    },
    {
      title: "Track Your Body Progress",
      subtitle: "See Real Results",
      description: "Monitor weight changes, body measurements, and visual progress with detailed analytics.",
      icon: "📈",
      color: "#8B5CF6"
    },
    {
      title: "Achieve Your Goals",
      subtitle: "Stay Motivated, Stay Consistent",
      description: "Join thousands of fitness enthusiasts who've transformed their bodies with Movora.",
      icon: "🎯",
      color: "#EC4899"
    }
  ];

  useEffect(() => {
    setFadeIn(true);
  }, [currentSlide]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setFadeIn(false);
      setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handleDotClick = (index) => {
    setFadeIn(false);
    setTimeout(() => {
      setCurrentSlide(index);
    }, 300);
  };

  const slide = slides[currentSlide];

  return (
    <div className="onboarding-container">
      {/* Background gradient animation */}
      <div className="onboarding-bg" style={{ background: `linear-gradient(135deg, ${slide.color}20 0%, ${slide.color}05 100%)` }} />

      <div className="onboarding-content">
        {/* Header with skip button */}
        <div className="onboarding-header">
          <div style={{ flex: 1 }} />
          {currentSlide < slides.length - 1 && (
            <button onClick={handleSkip} className="skip-btn">
              Skip
            </button>
          )}
        </div>

        {/* Main content */}
        <div className={`onboarding-slide ${fadeIn ? "fade-in" : "fade-out"}`}>
          {/* Icon with animation */}
          <div className="slide-icon" style={{ color: slide.color }}>
            {slide.icon}
          </div>

          {/* Text content */}
          <h1 className="slide-title">{slide.title}</h1>
          <h2 className="slide-subtitle">{slide.subtitle}</h2>
          <p className="slide-description">{slide.description}</p>

          {/* Progress dots */}
          <div className="slide-dots">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`dot ${index === currentSlide ? "active" : ""}`}
                onClick={() => handleDotClick(index)}
                style={{ backgroundColor: index === currentSlide ? slide.color : "#D1D5DB" }}
              />
            ))}
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="onboarding-footer">
          {currentSlide > 0 && (
            <button
              onClick={() => {
                setFadeIn(false);
                setTimeout(() => setCurrentSlide(currentSlide - 1), 300);
              }}
              className="btn-secondary"
            >
              ← Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="btn-primary"
            style={{ backgroundColor: slide.color }}
          >
            {currentSlide === slides.length - 1 ? "Get Started 🚀" : "Next →"}
          </button>
        </div>
      </div>

      {/* Floating elements for visual appeal */}
      <div className="floating-shapes">
        <div className="shape shape-1" style={{ borderColor: slide.color }} />
        <div className="shape shape-2" style={{ borderColor: slide.color }} />
        <div className="shape shape-3" style={{ borderColor: slide.color }} />
      </div>
    </div>
  );
}
