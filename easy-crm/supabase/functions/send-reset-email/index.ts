import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Resend } from "npm:resend@2.0.0"

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, newPassword } = await req.json()

    const data = await resend.emails.send({
      from: 'CRM <onboarding@resend.dev>', // Use seu domínio verificado ou o padrão de testes do Resend
      to: [email],
      subject: 'Sua senha foi redefinida',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Redefinição de Senha</h2>
          <p>Olá,</p>
          <p>Sua solicitação de redefinição de senha foi aprovada pelo administrador do sistema.</p>
          <p>Sua nova senha temporária é: <b>${newPassword}</b></p>
          <p>Recomendamos que você faça login no CRM e altere sua senha o quanto antes por motivos de segurança.</p>
        </div>
      `
    })

    return new Response(JSON.stringify(data), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400 
    })
  }
})