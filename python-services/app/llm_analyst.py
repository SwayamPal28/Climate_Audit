"""
LLM Analyst Engine for ClimaAuditX
Provides AI-powered analysis of climate policy simulations using Google Gemini API
"""

from google import genai
from google.genai import types
import os
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
import json
from typing import Dict, List, Optional

# Load environment variables
load_dotenv()


class LLMAnalystEngine:
    """
    Central LLM interface for analyzing climate policy simulations.
    Provides natural language explanations for complex data.
    """
    
    def __init__(self):
        """Initialize Gemini client and configuration"""
        # Load API key
        # Load API key
        api_key = os.getenv('GEMINI_API_KEY')
        self.api_key_valid = True
        
        # Check for placeholder or missing key
        if not api_key or api_key == 'your_actual_api_key_here' or "todo" in api_key.lower():
            print("⚠️ GEMINI_API_KEY missing or invalid. Falling back to Rule-Based Analyst.")
            self.api_key_valid = False
            self.client = None
            # Do NOT raise error here, we want the app to run in fallback mode
        else:
            # Configure Gemini client
            self.client = genai.Client(api_key=api_key)

        
        # Configure Gemini client
        self.client = genai.Client(api_key=api_key)
        
        # DEBUG: List available models
        print("\nDEBUG: Listing available Gemini models...")
        try:
            models_list = self.client.models.list()
            print("Available models:")
            for model in models_list:
                print(f"  - {model.name}")
                if hasattr(model, 'supported_generation_methods'):
                    print(f"    Methods: {model.supported_generation_methods}")
        except Exception as e:
            print(f"Could not list models: {e}")
        
        # Model settings - use models/ prefix for new API
        self.model_name = os.getenv('GEMINI_MODEL', 'models/gemini-2.0-flash')
        self.max_tokens = int(os.getenv('GEMINI_MAX_TOKENS', '2048'))
        self.temperature = float(os.getenv('GEMINI_TEMPERATURE', '0.3'))
        
        # Conversation history storage (keyed by session ID)
        self.conversations = {}
        
        print(f"✅ LLM Analyst Engine initialized with {self.model_name}")
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_policy_simulation(self, policy_data: Dict) -> Dict:
        """
        Analyze policy simulation results (CBAM, Tech Transfer, Fairness Dial)
        
        Args:
            policy_data: Dict containing policy_type, severity, metrics, context
            
        Returns:
            Dict with executive_summary, key_findings, tradeoffs, recommendation
        """
        try:
            prompt = self._build_policy_prompt(policy_data)
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens
                )
            )
            
            # Parse response into structured format
            analysis_text = response.text
            
            return {
                'executive_summary': self._extract_section(analysis_text, 'Executive Summary'),
                'key_findings': self._extract_section(analysis_text, 'Key Findings'),
                'tradeoffs': self._extract_section(analysis_text, 'Tradeoffs'),
                'recommendation': self._extract_section(analysis_text, 'Recommendation'),
                'full_text': analysis_text
            }
        except Exception as e:
            print(f"\n❌ POLICY ANALYSIS ERROR:")
            print(f"   Model: {self.model_name}")
            print(f"   Error: {str(e)}")
            print(f"   Type: {type(e).__name__}\n")
            return self._handle_api_error(e)
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_shapley_attribution(self, shapley_data: Dict) -> Dict:
        """
        Explain Shapley carbon attribution in plain language
        
        Args:
            shapley_data: Dict with target_country, allocations, contributors, total_co2_kt
            
        Returns:
            Dict with explanation and policy_implications
        """
        try:
            prompt = self._build_shapley_prompt(shapley_data)
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens
                )
            )
            
            return {
                'explanation': response.text,
                'target_country': shapley_data.get('target_country'),
                'methodology': 'Shapley Value (Game Theory)'
            }
        except Exception as e:
            return self._handle_api_error(e)
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_diplomatic_turn(self, turn_data: Dict) -> Dict:
        """
        Analyze MARL diplomatic game turn with strategic insights
        
        Args:
            turn_data: Dict with player_iso, rival_iso, turn_summary, ai_persona
            
        Returns:
            Dict with strategic_analysis, why_retaliated, next_move_advice
        """
        try:
            prompt = self._build_diplomatic_prompt(turn_data)
            if not self.api_key_valid:
                # Rule-Based Fallback
                player_action = turn_data.get('turn_summary', {}).get('player_action', {})
                ai_reaction = turn_data.get('turn_summary', {}).get('ai_reaction', {})
                p_sev = player_action.get('severity', 0) or 0
                d_inf = player_action.get('damage_inflicted', 0) or 0
                
                return {
                    'strategic_analysis': f"Automated Strategy: The AI detected a {p_sev*100:.0f}% tariff. Based on its {turn_data.get('ai_persona')} persona, it chose to {ai_reaction.get('action')}.",
                    'why_retaliated': f"Reaction to ${d_inf/1e6:.1f}M in damages.",
                    'next_move_advice': "Consider stabilizing tariffs to reach equilibrium.",
                    'full_text': "Analysis generated by Rule-Based System (LLM Offline)."
                }

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens
                )
            )
            
            analysis_text = response.text
            
            return {
                'strategic_analysis': self._extract_section(analysis_text, 'Strategic Analysis'),
                'why_retaliated': self._extract_section(analysis_text, 'Why Retaliated'),
                'next_move_advice': self._extract_section(analysis_text, 'Next Move'),
                'full_text': analysis_text
            }
        except Exception as e:
            return self._handle_api_error(e)
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_bilateral_optimization(self, bilateral_data: Dict) -> Dict:
        """
        Explain bilateral policy optimization and Pareto frontier
        
        Args:
            bilateral_data: Dict with source, target, sector, policy, upstream_impact
            
        Returns:
            Dict with explanation, why_optimal, political_feasibility
        """
        try:
            prompt = self._build_bilateral_prompt(bilateral_data)
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens
                )
            )
            
            analysis_text = response.text
            
            return {
                'explanation': self._extract_section(analysis_text, 'Explanation'),
                'why_optimal': self._extract_section(analysis_text, 'Why Optimal'),
                'political_feasibility': self._extract_section(analysis_text, 'Political Feasibility'),
                'full_text': analysis_text
            }
        except Exception as e:
            return self._handle_api_error(e)
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def analyze_graph_anomalies(self, anomaly_data: Dict) -> Dict:
        """
        Root cause analysis for anomaly detection
        
        Args:
            anomaly_data: Dict with anomalies list (iso, score, gdp, energy_intensity)
            
        Returns:
            Dict with root_causes (list of explanations per country)
        """
        try:
            prompt = self._build_anomaly_prompt(anomaly_data)
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens
                )
            )
            
            return {
                'analysis': response.text,
                'num_anomalies': len(anomaly_data.get('anomalies', []))
            }
        except Exception as e:
            return self._handle_api_error(e)
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def chat(self, conversation_history: List, user_question: str, context_data: Dict) -> str:
        """
        Handle follow-up questions with conversation context
        
        Args:
            conversation_history: List of previous messages
            user_question: New question from user
            context_data: Original simulation data for reference
            
        Returns:
            AI response string
        """
        try:
            # Build conversation prompt
            prompt = f"""You are an AI climate policy analyst helping users understand simulation results.

Context Data (Original Simulation):
{json.dumps(context_data, indent=2)}

Conversation History:
"""
            # Add last 10 messages for context
            for msg in conversation_history[-10:]:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                prompt += f"\n{role.upper()}: {content}\n"
            
            prompt += f"\nUSER: {user_question}\n\nASSISTANT:"
            
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.temperature,
                    max_output_tokens=self.max_tokens
                )
            )
            return response.text
            
        except Exception as e:
            return f"I encountered an error: {str(e)}. Please try rephrasing your question."
    
    # ==================== PROMPT BUILDERS ====================
    
    def _build_policy_prompt(self, policy_data: Dict) -> str:
        """Build prompt for policy simulation analysis"""
        policy_type = policy_data.get('policy_type', 'Unknown')
        severity = policy_data.get('severity', 0)
        metrics = policy_data.get('metrics', {})
        
        prompt = f"""You are a senior climate economist analyzing policy simulation results.

TASK: Analyze this {policy_type} simulation and provide actionable insights.

SIMULATION PARAMETERS:
- Policy Type: {policy_type}
- Severity/Intensity: {severity * 100:.1f}%

RESULTS:
{self._format_metrics_as_bullets(metrics)}

Please provide your analysis in the following structure:

## Executive Summary
[2-3 sentences summarizing the overall impact]

## Key Findings
[3-5 bullet points of the most important discoveries]

## Tradeoffs
[Explain the economic vs environmental tradeoffs]

## Recommendation
[Specific policy recommendation with reasoning]

CONSTRAINTS:
- Maximum 400 words total
- Cite specific numbers from the results
- Avoid jargon - explain like you're talking to a journalist
- Focus on actionable insights
"""
        return prompt
    
    def _build_shapley_prompt(self, shapley_data: Dict) -> str:
        """Build prompt for Shapley attribution explanation"""
        target = shapley_data.get('target_country', 'Unknown')
        allocations = shapley_data.get('allocations', {})
        total_co2 = shapley_data.get('total_co2_kt', 0)
        
        # Format contributors
        contributors_text = "\n".join([
            f"- {country}: {pct:.1f}%"
            for country, pct in sorted(allocations.items(), key=lambda x: x[1], reverse=True)[:10]
        ])
        
        prompt = f"""You are explaining carbon attribution to a policy maker who needs to understand responsibility.

TASK: Explain why different countries are responsible for {target}'s carbon footprint.

TARGET COUNTRY: {target}
TOTAL EMISSIONS: {total_co2:.1f} kt CO2

RESPONSIBILITY BREAKDOWN (Shapley Value):
{contributors_text}

Please explain:
1. What does this attribution mean in plain language?
2. Why is "SELF" (domestic production) at the percentage shown?
3. Which trade partners contribute most and why?
4. What are the policy implications?

Use everyday analogies (like splitting a restaurant bill) to make it understandable.
Keep it under 300 words.
"""
        return prompt
    
    def _build_diplomatic_prompt(self, turn_data: Dict) -> str:
        """Build prompt for diplomatic game analysis"""
        player = turn_data.get('player_iso', 'Country A')
        rival = turn_data.get('rival_iso', 'Country B')
        turn_summary = turn_data.get('turn_summary', {})
        ai_persona = turn_data.get('ai_persona', 'BALANCED')
        
        # New structured data from marl_engine
        player_action = turn_summary.get('player_action', {})
        ai_reaction = turn_summary.get('ai_reaction', {})
        
        prompt = f"""You are a geopolitical strategy analyst for an advanced climate policy simulation.

SCENARIO: {player} is negotiating with {rival} (Persona: {ai_persona}).

CURRENT TURN:
1. {player} ACTION:
   - Move: {player_action.get('action_type', 'TARIFF')} on {player_action.get('sector', 'Unknown')}
   - Intensity: {player_action.get('severity', 0) * 100:.1f}%
   - Economic Damage to {rival}: ${player_action.get('damage_inflicted', 0) / 1e6:.1f}M

2. {rival} REACTION:
   - Action: {ai_reaction.get('action', 'WAIT')}
   - Retaliation Tariff: {ai_reaction.get('tariff_rate', 0) * 100:.1f}%
   - Counter-Damage to {player}: ${ai_reaction.get('estimated_damage_to_opponent', 0) / 1e6:.1f}M
   - Reasoning: "{ai_reaction.get('description', '')}"

ANALYSIS TASK:
1. Strategic Analysis: Evaluate {rival}'s response given its {ai_persona} persona.
2. Why Retaliated: Explain the proportionality (or disproportionality) of the response.
3. Next Move: Reccomend specific de-escalation or pressure leverage steps for {player} to reach a favorable equilibrium.

Provide the response in valid JSON with keys: "strategic_analysis", "why_retaliated", "next_move_advice".
Keep the tone professional and insightful.
"""
        return prompt
    
    def _build_bilateral_prompt(self, bilateral_data: Dict) -> str:
        """Build prompt for bilateral optimization explanation"""
        source = bilateral_data.get('source', 'Country A')
        target = bilateral_data.get('target', 'Country B')
        sector = bilateral_data.get('sector', 'Unknown')
        policy = bilateral_data.get('policy', {})
        upstream_impact = bilateral_data.get('upstream_impact', [])
        
        optimal_rate = policy.get('optimal_tax_rate', 0)
        carbon_reduction = policy.get('carbon_reduction_kt', 0)
        gdp_loss = policy.get('gdp_loss_usd', 0)
        
        # Format upstream impacts
        upstream_text = "\n".join([
            f"- {item.get('supplier_country', 'Unknown')}: ${item.get('revenue_loss_usd', 0) / 1e6:.1f}M loss"
            for item in upstream_impact[:5]
        ])
        
        prompt = f"""You are a trade policy advisor explaining an optimization result.

SCENARIO: Finding the optimal carbon tariff for {source} to impose on {target} in the {sector} sector.

OPTIMIZATION RESULT:
- Optimal Tax Rate: {optimal_rate * 100:.1f}%
- Carbon Reduction: {carbon_reduction:.2f} kt CO2
- GDP Loss to {target}: ${gdp_loss / 1e6:.1f}M

UPSTREAM SUPPLIERS AFFECTED:
{upstream_text}

Please explain:

## Explanation
[What is a Pareto-optimal tax rate and why is this the best choice?]

## Why Optimal
[Why not higher (more carbon reduction) or lower (less economic damage)?]

## Political Feasibility
[Is this politically realistic? What are the implementation challenges?]

Keep under 350 words. Use clear, non-technical language.
"""
        return prompt
    
    def _build_anomaly_prompt(self, anomaly_data: Dict) -> str:
        """Build prompt for anomaly root cause analysis"""
        anomalies = anomaly_data.get('anomalies', [])
        
        # Format anomaly list
        anomaly_text = "\n".join([
            f"- {a.get('iso', 'Unknown')}: Score {a.get('score', 0):.1f}, "
            f"GDP ${a.get('gdp', 0) / 1e9:.1f}B, "
            f"Energy Intensity {a.get('energy_intensity', 0):.1f}"
            for a in anomalies[:5]
        ])
        
        prompt = f"""You are a climate risk analyst investigating why certain countries are flagged as anomalies.

FLAGGED COUNTRIES (Top 5):
{anomaly_text}

TASK: Explain why these countries are flagged as high-risk anomalies.

For each country, provide:
1. Root cause (why is it flagged?)
2. What specific metric is problematic?
3. What policy lever could address this?

Also explain:
- What makes a country an "anomaly" in this system?
- Why might some high-GDP countries NOT be flagged?

Keep under 400 words total. Be specific and actionable.
"""
        return prompt
    
    # ==================== HELPER FUNCTIONS ====================
    
    def _format_metrics_as_bullets(self, metrics: Dict) -> str:
        """Convert metrics dictionary to readable bullet points"""
        bullets = []
        for key, value in metrics.items():
            # Format key (convert snake_case to Title Case)
            formatted_key = key.replace('_', ' ').title()
            
            # Format value
            if isinstance(value, (int, float)):
                if abs(value) >= 1e9:
                    formatted_value = f"${value / 1e9:.2f}B"
                elif abs(value) >= 1e6:
                    formatted_value = f"${value / 1e6:.2f}M"
                elif 'pct' in key or 'percent' in key:
                    formatted_value = f"{value:.2f}%"
                else:
                    formatted_value = f"{value:,.2f}"
            else:
                formatted_value = str(value)
            
            bullets.append(f"• {formatted_key}: {formatted_value}")
        
        return "\n".join(bullets)
    
    def _extract_section(self, text: str, section_name: str) -> str:
        """Extract a specific section from markdown-formatted text"""
        lines = text.split('\n')
        section_lines = []
        capturing = False
        
        for line in lines:
            # Check if this is the section header
            if section_name.lower() in line.lower() and ('##' in line or '**' in line):
                capturing = True
                continue
            
            # Stop if we hit another section header
            if capturing and ('##' in line or (line.startswith('**') and line.endswith('**'))):
                break
            
            # Capture content
            if capturing and line.strip():
                section_lines.append(line.strip())
        
        return '\n'.join(section_lines) if section_lines else text
    
    def _handle_api_error(self, error: Exception) -> Dict:
        """Handle API errors gracefully"""
        error_msg = str(error)
        
        if 'API_KEY' in error_msg.upper():
            return {
                'error': 'Invalid API key. Please check your .env file.',
                'details': 'Get your key from https://makersuite.google.com/app/apikey'
            }
        elif 'RATE_LIMIT' in error_msg.upper():
            return {
                'error': 'Rate limit exceeded. Please wait a moment and try again.',
                'details': 'The Gemini API has usage limits.'
            }
        elif 'NETWORK' in error_msg.upper() or 'CONNECTION' in error_msg.upper():
            return {
                'error': 'Network error. Please check your internet connection.',
                'details': str(error)
            }
        else:
            return {
                'error': 'Analysis failed. Please try again.',
                'details': str(error)
            }
