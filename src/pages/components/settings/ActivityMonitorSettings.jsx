import { useState, useEffect } from "react";
import axios from "../../../lib/axios_instance";
import { Row, Col, Form, Button, Alert } from "react-bootstrap";
import { Trans } from "react-i18next";
import Loading from "../general/loading";

export default function ActivityMonitorSettings() {
  const [settings, setSettings] = useState({
    activeSessionsInterval: 1000,
    idleInterval: 5000
  });
  const [isSubmitted, setIsSubmitted] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get("/api/getActivityMonitorSettings", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      setSettings(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching Activity Monitor settings:", error);
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: parseInt(value, 10)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitted("");
    setSubmissionMessage("");

    try {
      await axios.post("/api/setActivityMonitorSettings", settings, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      setIsSubmitted("Success");
      setSubmissionMessage("Paramètres de surveillance mis à jour avec succès - Appliqués en temps réel");
    } catch (error) {
      console.error("Error updating Activity Monitor settings:", error);
      setIsSubmitted("Failed");
      setSubmissionMessage(
        error.response?.data || "Erreur lors de la mise à jour des paramètres"
      );
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div>
      <h1>
        <Trans i18nKey={"SETTINGS_PAGE.ACTIVITY_MONITOR"} defaults="Surveillance d'activité" />
      </h1>
      
      <div className="mb-3 text-muted">
        <small>
            <Trans 
              i18nKey={"SETTINGS_PAGE.REALTIME_UPDATE_INFO"} 
              defaults="Les modifications sont appliquées en temps réel sans redémarrage du serveur."
            />
        </small>
      </div>
        
      <Form onSubmit={handleSubmit} className="settings-form">
        <Form.Group as={Row} className="mb-3">
          <Form.Label column className="">
            <Trans 
              i18nKey={"SETTINGS_PAGE.ACTIVE_SESSIONS_INTERVAL"} 
              defaults="Intervalle avec sessions actives (ms)"
            />
          </Form.Label>
          <Col sm="10">
            <Form.Control
              type="number"
              name="activeSessionsInterval"
              value={settings.activeSessionsInterval}
              onChange={handleInputChange}
              min="500"
              max="10000"
              step="100"
              required
              autoComplete="off"
            />
            <Form.Text className="text-muted">
              <Trans 
                i18nKey={"SETTINGS_PAGE.ACTIVE_SESSIONS_HELP"} 
                defaults="Fréquence de vérification quand des utilisateurs regardent du contenu (recommandé: 1000ms)"
              />
            </Form.Text>
          </Col>
        </Form.Group>

        <Form.Group as={Row} className="mb-3">
          <Form.Label column className="">
            <Trans 
              i18nKey={"SETTINGS_PAGE.IDLE_INTERVAL"} 
              defaults="Intervalle en veille (ms)"
            />
          </Form.Label>
          <Col sm="10">
            <Form.Control
              type="number"
              name="idleInterval"
              value={settings.idleInterval}
              onChange={handleInputChange}
              min="1000"
              max="30000"
              step="1000"
              required
              autoComplete="off"
            />
            <Form.Text className="text-muted">
              <Trans 
                i18nKey={"SETTINGS_PAGE.IDLE_HELP"} 
                defaults="Fréquence de vérification quand aucune session active (recommandé: 5000ms)"
              />
            </Form.Text>
          </Col>
        </Form.Group>

        {settings.activeSessionsInterval > settings.idleInterval && (
          <Alert bg="dark" data-bs-theme="dark" variant="warning" className="mb-3">
            <Trans 
              i18nKey={"SETTINGS_PAGE.INTERVAL_WARNING"} 
              defaults="L'intervalle actif ne devrait pas être supérieur à l'intervalle de veille"
            />
          </Alert>
        )}

        {isSubmitted !== "" ? (
          isSubmitted === "Failed" ? (
            <Alert bg="dark" data-bs-theme="dark" variant="danger">
              {submissionMessage}
            </Alert>
          ) : (
            <Alert bg="dark" data-bs-theme="dark" variant="success">
              {submissionMessage}
            </Alert>
          )
        ) : (
          <></>
        )}

        <div className="d-flex flex-column flex-md-row justify-content-end align-items-md-center">
          <Button variant="outline-success" type="submit">
            <Trans i18nKey={"SETTINGS_PAGE.UPDATE"} />
          </Button>
        </div>
      </Form>
    </div>
  );
}
